"""End-to-end test of the WebSocket training-progress plumbing.

Uses ``fastapi.testclient.TestClient``, not ``httpx.AsyncClient``: httpx
cannot open a WebSocket connection at all (that needs the separate
``httpx-ws`` package). ``TestClient.websocket_connect()`` is a synchronous
context manager, and an HTTP ``POST`` issued from the *same* TestClient inside
that context runs through the same portal/event loop -- which is exactly the
connection-order the plan's WS contract requires: socket fully open, then
``POST /api/train``.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.train import FAKE_EPOCHS
from app.services import registry

CORPUS = [
    {"sentence": "roll forward 40 centimeters", "intent": "STRAIGHT", "amount_cm": 40.0},
    {"sentence": "spin to the left", "intent": "TURN_LEFT", "amount_cm": None},
]


@pytest.fixture(autouse=True)
def _clean_registry():
    registry.clear()
    yield
    registry.clear()


def test_ws_receives_full_fake_training_sequence_in_order() -> None:
    job_id = str(uuid.uuid4())

    with TestClient(app) as client:
        assert client.get(f"/api/model/{job_id}").json()["trained"] is False

        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            response = client.post(
                "/api/train",
                json={
                    "job_id": job_id,
                    "corpus": CORPUS,
                    "epochs": 5,
                    "learning_rate": 0.05,
                },
            )
            assert response.status_code == 202

            first = ws.receive_json()
            assert first == {"type": "log", "message": "Training started"}

            for epoch in range(1, FAKE_EPOCHS + 1):
                progress = ws.receive_json()
                assert progress["type"] == "progress"
                assert progress["progress"] == pytest.approx(epoch / FAKE_EPOCHS)

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

        predict = client.post(
            "/api/predict",
            json={"job_id": job_id, "sentences": ["roll forward 40 centimeters"]},
        )
        assert predict.status_code == 200
        assert predict.json()["predictions"][0]["command"]


def test_fake_metrics_curves_improve_monotonically() -> None:
    """The fake curves must look like training: losses fall, accuracy rises."""
    job_id = str(uuid.uuid4())
    collected: list[dict[str, float]] = []

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
            client.post(
                "/api/train",
                json={
                    "job_id": job_id,
                    "corpus": CORPUS,
                    "epochs": 5,
                    "learning_rate": 0.05,
                },
            )
            while True:
                message = ws.receive_json()
                if message["type"] == "metrics":
                    collected.append(message["metrics"])
                elif message["type"] == "completed":
                    break

    assert len(collected) == FAKE_EPOCHS
    intent_losses = [m["intent_loss"] for m in collected]
    amount_losses = [m["amount_loss"] for m in collected]
    accuracies = [m["intent_accuracy"] for m in collected]
    assert intent_losses == sorted(intent_losses, reverse=True)
    assert amount_losses == sorted(amount_losses, reverse=True)
    assert accuracies == sorted(accuracies)


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
                        "epochs": 5,
                        "learning_rate": 0.05,
                    },
                )
                assert ws_a.receive_json()["type"] == "log"
                assert ws_b.receive_json()["type"] == "log"


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
                        "epochs": 5,
                        "learning_rate": 0.05,
                    },
                )
                while ws.receive_json()["type"] != "completed":
                    pass

        assert registry.has_model(trained_job) is True
        assert registry.has_model(other_job) is False
