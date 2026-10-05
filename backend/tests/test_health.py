"""Smoke tests for the non-training endpoints."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import registry


@pytest.fixture(autouse=True)
def _clean_registry():
    """Keep the module-level model registry from leaking between tests."""
    registry.clear()
    yield
    registry.clear()


def test_health_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_model_status_is_200_and_false_for_unknown_job() -> None:
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        response = client.get(f"/api/model/{job_id}")
    # Always 200, never 404 -- the frontend branches on the boolean.
    assert response.status_code == 200
    assert response.json() == {"job_id": job_id, "trained": False}


def test_predict_404s_for_untrained_job() -> None:
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        response = client.post(
            "/api/predict", json={"job_id": job_id, "sentences": ["go forward a bit"]}
        )
    assert response.status_code == 404


def test_predict_returns_contract_shape_for_trained_job() -> None:
    job_id = str(uuid.uuid4())
    registry.set_model(job_id, True)
    with TestClient(app) as client:
        response = client.post(
            "/api/predict",
            json={"job_id": job_id, "sentences": ["go forward", "spin around"]},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == job_id
    assert len(body["predictions"]) == 2
    for item, sentence in zip(body["predictions"], ["go forward", "spin around"]):
        assert item["sentence"] == sentence
        assert item["intent"] in {
            "STRAIGHT",
            "BACKWARDS",
            "TURN_RIGHT",
            "TURN_LEFT",
            "TURN_180",
        }
        assert isinstance(item["command"], str) and item["command"]
        assert item["amount_cm"] is None or isinstance(item["amount_cm"], (int, float))


def test_train_rejects_invalid_body() -> None:
    with TestClient(app) as client:
        response = client.post("/api/train", json={"job_id": "x"})
    assert response.status_code == 422
