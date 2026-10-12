"""Edge cases from PR-11: a double-clicked Train, empty predict, a socket that
drops and comes back mid-run, and a backend restart under a live tab.

Runs that must stay "mid-training" use a fake ``train_model`` that emits one
epoch and then blocks on a ``threading.Event`` until the test releases it.
Every test still drains its socket to ``completed`` before leaving the
``TestClient`` context, so no training thread outlives the event loop.
"""

from __future__ import annotations

import threading
import uuid
from typing import Any

import pytest
import torch
from fastapi.testclient import TestClient

from app.main import app
from app.routers import train as train_router
from app.services import model as model_module
from app.services import registry
from app.services.corpus import TrainingExample as CorpusExample

CORPUS = [
    {"sentence": "roll forward 40 centimeters", "intent": "STRAIGHT", "amount_cm": 40.0},
    {"sentence": "spin to the left", "intent": "TURN_LEFT", "amount_cm": None},
]

#: Upper bound on any wait in these tests, so a bug fails instead of hanging.
TIMEOUT_SECONDS = 10.0


def _metrics(epoch: int) -> dict[str, Any]:
    return {"epoch": epoch, "intent_loss": 1.0, "amount_loss": 0.1, "intent_accuracy": 0.5}


def _train_body(job_id: str, epochs: int = 2) -> dict[str, Any]:
    return {"job_id": job_id, "corpus": CORPUS, "epochs": epochs, "learning_rate": 0.05}


@pytest.fixture(autouse=True)
def _clean_state():
    registry.clear()
    train_router._active_jobs.clear()
    yield
    registry.clear()
    train_router._active_jobs.clear()


@pytest.fixture(autouse=True)
def _seed_torch() -> None:
    torch.manual_seed(0)


class GatedTrainer:
    """Fake ``train_model``: epoch 1, wait for ``release()``, epoch 2, done."""

    def __init__(self) -> None:
        self.gate = threading.Event()
        self.calls = 0
        self.returned: Any = None

    def release(self) -> None:
        self.gate.set()

    def __call__(self, corpus, epochs, learning_rate, on_epoch_end=None):
        self.calls += 1
        on_epoch_end(_metrics(1))
        assert self.gate.wait(TIMEOUT_SECONDS), "test never released the trainer"
        on_epoch_end(_metrics(2))
        self.returned = model_module.train_model(corpus, 1, learning_rate)
        return self.returned


def test_second_train_while_training_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """A double-click: the second POST gets a log, the first run is untouched."""
    trainer = GatedTrainer()
    monkeypatch.setattr(train_router, "train_model", trainer)
    job_id = str(uuid.uuid4())

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            first = client.post("/api/train", json=_train_body(job_id))
            assert first.status_code == 202
            assert first.json() == {"job_id": job_id, "status": "accepted"}
            # Epoch 1 has arrived, so the run is now blocked mid-training.
            assert [ws.receive_json()["type"] for _ in range(3)] == ["log", "progress", "metrics"]

            second = client.post("/api/train", json=_train_body(job_id, epochs=7))
            assert second.status_code == 202
            assert second.json() == {"job_id": job_id, "status": "already_training"}
            assert ws.receive_json() == {
                "type": "log",
                "message": train_router.ALREADY_TRAINING_MESSAGE,
            }

            trainer.release()
            rest = [ws.receive_json() for _ in range(3)]

        assert rest[0] == {"type": "progress", "progress": pytest.approx(2 / 2)}
        assert rest[1] == {"type": "metrics", "metrics": _metrics(2)}
        assert rest[2]["type"] == "completed"
        assert rest[2]["message"] == "Training complete"
        assert set(rest[2]) == {"type", "message", "stats"}
        assert trainer.calls == 1
        assert registry.get_model(job_id) is trainer.returned
        assert job_id not in train_router._active_jobs


def test_train_accepted_again_after_run_ends(monkeypatch: pytest.MonkeyPatch) -> None:
    """The busy flag clears when a run ends, failed runs included."""

    def failing_train_model(corpus, epochs, learning_rate, on_epoch_end=None):
        raise RuntimeError("boom")

    monkeypatch.setattr(train_router, "train_model", failing_train_model)
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            for _ in range(2):
                response = client.post("/api/train", json=_train_body(job_id))
                assert response.json()["status"] == "accepted"
                assert [ws.receive_json()["type"] for _ in range(2)] == ["log", "failed"]


def test_predict_with_no_sentences_returns_empty_list() -> None:
    job_id = str(uuid.uuid4())
    corpus = [CorpusExample(**example) for example in CORPUS]
    registry.set_model(job_id, model_module.train_model(corpus, 1, 0.05))
    with TestClient(app) as client:
        response = client.post("/api/predict", json={"job_id": job_id, "sentences": []})
    assert response.status_code == 200
    assert response.json() == {"job_id": job_id, "predictions": []}


def test_socket_reconnect_mid_training_gets_the_rest(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disconnecting mid-run doesn't break the broadcast; a reconnect hears the end."""
    trainer = GatedTrainer()
    monkeypatch.setattr(train_router, "train_model", trainer)
    job_id = str(uuid.uuid4())

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as first_ws:
            assert client.post("/api/train", json=_train_body(job_id)).status_code == 202
            assert [first_ws.receive_json()["type"] for _ in range(3)] == ["log", "progress", "metrics"]
        # first_ws is closed now; the run is still blocked mid-training.

        with client.websocket_connect(f"/api/ws/training/{job_id}") as second_ws:
            trainer.release()
            rest = [second_ws.receive_json() for _ in range(3)]

        assert [m["type"] for m in rest] == ["progress", "metrics", "completed"]
        assert rest[1]["metrics"] == _metrics(2)
        assert registry.has_model(job_id)


def test_backend_restart_reports_untrained() -> None:
    """A restart empties the registry: status says untrained and predict 404s.

    That's what the frontend's recovery path keys on (Step 4's mount check and
    the 404 handling in Steps 5 and 6) to send the student back to Step 4.
    """
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            client.post("/api/train", json=_train_body(job_id))
            while (msg := ws.receive_json())["type"] not in {"completed", "failed"}:
                pass
        assert msg["type"] == "completed"
        assert client.get(f"/api/model/{job_id}").json() == {"job_id": job_id, "trained": True}

        registry.clear()  # what a uvicorn restart does to the in-memory store

        status = client.get(f"/api/model/{job_id}")
        assert status.status_code == 200
        assert status.json() == {"job_id": job_id, "trained": False}
        predict = client.post("/api/predict", json={"job_id": job_id, "sentences": ["turn left"]})
        assert predict.status_code == 404
