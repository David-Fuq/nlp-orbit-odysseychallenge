"""End-to-end test of the WebSocket training-progress plumbing.

Uses ``fastapi.testclient.TestClient``, not ``httpx.AsyncClient``: httpx
cannot open a WebSocket connection at all (that needs the separate
``httpx-ws`` package). ``TestClient.websocket_connect()`` is a synchronous
context manager, and an HTTP ``POST`` issued from the *same* TestClient inside
that context runs through the same portal/event loop -- which is exactly the
connection-order the plan's WS contract requires: socket fully open, then
``POST /api/train``.

These run PR-04's real model through the endpoint (PR-05). Weight init uses
torch's process-global RNG, so seeding here also covers the worker thread the
router trains in. Every test drains its socket to ``completed`` before leaving
the ``TestClient`` context, so no training thread outlives the event loop.
"""

from __future__ import annotations

import uuid

import pytest
import torch
from fastapi.testclient import TestClient

from app.main import app
from app.services import registry
from app.services.model import TrainedModel

CORPUS = [
    {"sentence": "roll forward 40 centimeters", "intent": "STRAIGHT", "amount_cm": 40.0},
    {"sentence": "spin to the left", "intent": "TURN_LEFT", "amount_cm": None},
]

#: Epoch count sent in every request below; assertions derive from it.
EPOCHS = 20


@pytest.fixture(autouse=True)
def _clean_registry():
    registry.clear()
    yield
    registry.clear()


@pytest.fixture(autouse=True)
def _seed_torch() -> None:
    torch.manual_seed(0)


def test_ws_receives_full_training_sequence_in_order() -> None:
    job_id = str(uuid.uuid4())

    with TestClient(app) as client:
        assert client.get(f"/api/model/{job_id}").json()["trained"] is False

        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            response = client.post(
                "/api/train",
                json={
                    "job_id": job_id,
                    "corpus": CORPUS,
                    "epochs": EPOCHS,
                    "learning_rate": 0.05,
                },
            )
            assert response.status_code == 202

            first = ws.receive_json()
            assert first == {"type": "log", "message": "Training started"}

            for epoch in range(1, EPOCHS + 1):
                progress = ws.receive_json()
                assert progress["type"] == "progress"
                assert progress["progress"] == pytest.approx(epoch / EPOCHS)

                metrics = ws.receive_json()
                assert metrics["type"] == "metrics"
                assert metrics["metrics"]["epoch"] == epoch
                assert set(metrics["metrics"]) == {
                    "epoch",
                    "intent_loss",
                    "amount_loss",
                    "intent_accuracy",
                }

            final = ws.receive_json()
            assert final == {"type": "completed", "message": "Training complete"}

        # The registry is written before ``completed`` is broadcast, so the
        # model is queryable as soon as the client sees that message.
        status_body = client.get(f"/api/model/{job_id}").json()
        assert status_body == {"job_id": job_id, "trained": True}
        assert isinstance(registry.get_model(job_id), TrainedModel)

        predict = client.post(
            "/api/predict",
            json={"job_id": job_id, "sentences": ["roll forward 40 centimeters"]},
        )
        assert predict.status_code == 200
        assert predict.json()["predictions"][0]["command"]


def test_metrics_curves_improve_over_training() -> None:
    """Real curves look like training: intent loss falls, accuracy does not drop.

    Adam does not guarantee a monotonic curve epoch by epoch, so this compares
    the last epoch against the first rather than requiring a sorted sequence.
    """
    job_id = str(uuid.uuid4())
    collected: list[dict[str, float]] = []

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            client.post(
                "/api/train",
                json={
                    "job_id": job_id,
                    "corpus": CORPUS,
                    "epochs": EPOCHS,
                    "learning_rate": 0.05,
                },
            )
            while True:
                message = ws.receive_json()
                if message["type"] == "metrics":
                    collected.append(message["metrics"])
                elif message["type"] == "completed":
                    break

    assert len(collected) == EPOCHS
    assert [m["epoch"] for m in collected] == list(range(1, EPOCHS + 1))
    assert collected[-1]["intent_loss"] < collected[0]["intent_loss"]
    assert collected[-1]["intent_accuracy"] >= collected[0]["intent_accuracy"]


def test_two_clients_on_one_job_both_receive_messages() -> None:
    """``broadcast`` fans out to every socket registered for a job_id."""
    job_id = str(uuid.uuid4())

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws_a:
            with client.websocket_connect(f"/api/ws/training/{job_id}") as ws_b:
                client.post(
                    "/api/train",
                    json={
                        "job_id": job_id,
                        "corpus": CORPUS,
                        "epochs": EPOCHS,
                        "learning_rate": 0.05,
                    },
                )
                assert ws_a.receive_json()["type"] == "log"
                assert ws_b.receive_json()["type"] == "log"
                # Drain both so the run finishes inside the client context.
                while ws_a.receive_json()["type"] != "completed":
                    pass
                while ws_b.receive_json()["type"] != "completed":
                    pass


def test_messages_are_scoped_to_their_job_id() -> None:
    """A socket on one job_id never sees another job_id's traffic."""
    trained_job = str(uuid.uuid4())
    other_job = str(uuid.uuid4())

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{other_job}"):
            with client.websocket_connect(f"/api/ws/training/{trained_job}") as ws:
                client.post(
                    "/api/train",
                    json={
                        "job_id": trained_job,
                        "corpus": CORPUS,
                        "epochs": EPOCHS,
                        "learning_rate": 0.05,
                    },
                )
                while ws.receive_json()["type"] != "completed":
                    pass

        assert registry.has_model(trained_job) is True
        assert registry.has_model(other_job) is False
