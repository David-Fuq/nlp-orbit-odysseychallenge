"""Integration tests: PR-04's real model wired through PR-02's endpoints (PR-05).

Every training test goes through the real HTTP + WebSocket path: open the
socket, ``POST /api/train``, drain messages until ``completed``/``failed``.
Weight init uses torch's process-global RNG, so the autouse seed below also
covers the worker thread the router trains in. Production code never seeds.

lr 0.05 x 50 epochs is the setting PR-04 measured reaching 100% train accuracy
on the default corpus.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Any

import pytest
import torch
from fastapi.testclient import TestClient

from app.main import app
from app.routers import train as train_router
from app.schemas import TrainingExample as WireExample
from app.services import model as model_module
from app.services import registry
from app.services.corpus import (
    RESERVED_TEST_AMOUNTS,
    TrainingExample as CorpusExample,
    load_base_corpus,
    load_test_log,
)
from app.services.model import TrainedModel

EPOCHS = 50
LEARNING_RATE = 0.05

#: Reserved amounts far from the default corpus's mean (~79 cm). The corpus
#: never contains them, so predicting them proves the numeric channel works.
FAR_RESERVED_AMOUNTS = (7, 26, 118, 143)
assert set(FAR_RESERVED_AMOUNTS) <= set(RESERVED_TEST_AMOUNTS)

TERMINAL = {"completed", "failed"}


@pytest.fixture(autouse=True)
def _clean_registry():
    registry.clear()
    yield
    registry.clear()


@pytest.fixture(autouse=True)
def _seed_torch() -> None:
    torch.manual_seed(0)


def _base_corpus_wire() -> list[dict[str, Any]]:
    return [asdict(example) for example in load_base_corpus()]


def _train(
    client: TestClient,
    job_id: str,
    corpus: list[dict[str, Any]],
    epochs: int = EPOCHS,
    learning_rate: float = LEARNING_RATE,
) -> list[dict[str, Any]]:
    """Open the WS, POST /api/train, and return every message up to the end."""
    messages: list[dict[str, Any]] = []
    with client.websocket_connect(f"/api/ws/training/{job_id}") as ws:
        response = client.post(
            "/api/train",
            json={
                "job_id": job_id,
                "corpus": corpus,
                "epochs": epochs,
                "learning_rate": learning_rate,
            },
        )
        assert response.status_code == 202
        while not messages or messages[-1]["type"] not in TERMINAL:
            messages.append(ws.receive_json())
    return messages


def _predict(client: TestClient, job_id: str, sentences: list[str]) -> list[dict[str, Any]]:
    response = client.post("/api/predict", json={"job_id": job_id, "sentences": sentences})
    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == job_id
    assert [item["sentence"] for item in body["predictions"]] == sentences
    return body["predictions"]


def _trained(client: TestClient, job_id: str) -> bool:
    response = client.get(f"/api/model/{job_id}")
    assert response.status_code == 200
    return response.json()["trained"]


def _assert_epoch_pairs(messages: list[dict[str, Any]], epochs: int) -> None:
    """``messages`` is exactly ``epochs`` (progress, metrics) pairs, in order."""
    assert len(messages) == 2 * epochs
    for epoch in range(1, epochs + 1):
        progress, metrics = messages[2 * epoch - 2], messages[2 * epoch - 1]
        assert progress == {"type": "progress", "progress": pytest.approx(epoch / epochs)}
        assert metrics["type"] == "metrics"
        assert metrics["metrics"]["epoch"] == epoch


# ── Train → predict ─────────────────────────────────────────────────────


def test_train_then_predict_near_training_example() -> None:
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        messages = _train(client, job_id, _base_corpus_wire())
        assert messages[0] == {"type": "log", "message": "Training started"}
        _assert_epoch_pairs(messages[1:-1], EPOCHS)
        assert messages[-1] == {"type": "completed", "message": "Training complete"}

        assert _trained(client, job_id) is True
        assert isinstance(registry.get_model(job_id), TrainedModel)

        left, half, back = _predict(
            client, job_id, ["turn left", "do a 180", "back up 50 centimeters"]
        )
    assert left["command"] == "TURN LEFT" and left["amount_cm"] is None
    assert half["command"] == "TURN 180" and half["amount_cm"] is None
    assert back["intent"] == "BACKWARDS"
    assert back["amount_cm"] == pytest.approx(50, abs=15)
    assert back["command"] == f"BACKWARDS {int(back['amount_cm'])}"


def test_predict_404_for_untrained_job() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/predict",
            json={"job_id": str(uuid.uuid4()), "sentences": ["turn left"]},
        )
    assert response.status_code == 404


def test_empty_corpus_falls_back_to_base_corpus() -> None:
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        messages = _train(client, job_id, [])
        assert _trained(client, job_id) is True

    count = len(load_base_corpus())
    assert messages[0] == {"type": "log", "message": "Training started"}
    assert messages[1] == {
        "type": "log",
        "message": f"No corpus supplied; training on the default base corpus ({count} examples)",
    }
    _assert_epoch_pairs(messages[2:-1], EPOCHS)
    assert messages[-1]["type"] == "completed"


# ── Failure paths ───────────────────────────────────────────────────────


def test_straight_without_amount_fails() -> None:
    job_id = str(uuid.uuid4())
    corpus = _base_corpus_wire()
    corpus.append({"sentence": "roll forward a bit", "intent": "STRAIGHT", "amount_cm": None})
    with TestClient(app) as client:
        messages = _train(client, job_id, corpus)
        assert _trained(client, job_id) is False
        response = client.post(
            "/api/predict", json={"job_id": job_id, "sentences": ["turn left"]}
        )
        assert response.status_code == 404

    assert messages[0] == {"type": "log", "message": "Training started"}
    assert len(messages) == 2
    assert messages[-1]["type"] == "failed"
    assert "roll forward a bit" in messages[-1]["message"]
    assert "require amount_cm" in messages[-1]["message"]


def test_turn_with_amount_fails() -> None:
    job_id = str(uuid.uuid4())
    corpus = [
        {"sentence": "roll forward 40 cm", "intent": "STRAIGHT", "amount_cm": 40.0},
        {"sentence": "turn left 90", "intent": "TURN_LEFT", "amount_cm": 90.0},
    ]
    with TestClient(app) as client:
        messages = _train(client, job_id, corpus)
        assert _trained(client, job_id) is False

    assert [m["type"] for m in messages] == ["log", "failed"]
    assert "must not carry amount_cm" in messages[-1]["message"]


def test_exception_mid_training_reports_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    """An arbitrary error raised inside ``train_model`` ends in ``failed``."""

    def exploding_train_model(corpus, epochs, learning_rate, on_epoch_end=None):
        on_epoch_end(
            {"epoch": 1, "intent_loss": 1.6, "amount_loss": 0.5, "intent_accuracy": 0.2}
        )
        raise RuntimeError("boom")

    monkeypatch.setattr(train_router, "train_model", exploding_train_model)
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        messages = _train(client, job_id, _base_corpus_wire(), epochs=4)
        assert _trained(client, job_id) is False

    assert [m["type"] for m in messages] == ["log", "progress", "metrics", "failed"]
    assert messages[1]["progress"] == pytest.approx(1 / 4)
    assert messages[-1] == {"type": "failed", "message": "boom"}


def test_failed_retrain_keeps_previous_model() -> None:
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        assert _train(client, job_id, _base_corpus_wire())[-1]["type"] == "completed"
        first = registry.get_model(job_id)

        bad = [{"sentence": "back up", "intent": "BACKWARDS", "amount_cm": None}]
        assert _train(client, job_id, bad)[-1]["type"] == "failed"

        assert _trained(client, job_id) is True
        assert registry.get_model(job_id) is first
        assert _predict(client, job_id, ["turn left"])[0]["command"] == "TURN LEFT"


# ── Pass-through contracts ──────────────────────────────────────────────


def test_metrics_forwarded_unchanged_and_args_passed_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Metrics dicts arrive byte-for-byte; epochs/lr/corpus reach train_model as sent."""
    emitted = [
        {"epoch": 1, "intent_loss": 1.234567891234, "amount_loss": 0.000123456789, "intent_accuracy": 0.3333333333},
        {"epoch": 2, "intent_loss": 0.987654321987, "amount_loss": 0.000098765432, "intent_accuracy": 0.6666666667},
        {"epoch": 3, "intent_loss": 0.111111111111, "amount_loss": 0.000011111111, "intent_accuracy": 1.0},
    ]
    seen: dict[str, Any] = {}
    real_train_model = model_module.train_model

    def recording_train_model(corpus, epochs, learning_rate, on_epoch_end=None):
        seen.update(corpus=corpus, epochs=epochs, learning_rate=learning_rate)
        for payload in emitted:
            on_epoch_end(dict(payload))
        return real_train_model(corpus, 1, learning_rate)

    monkeypatch.setattr(train_router, "train_model", recording_train_model)
    corpus = [
        {"sentence": "roll forward 40 cm", "intent": "STRAIGHT", "amount_cm": 40.0},
        {"sentence": "turn left", "intent": "TURN_LEFT", "amount_cm": None},
    ]
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        messages = _train(client, job_id, corpus, epochs=3, learning_rate=0.0123)

    assert seen["epochs"] == 3
    assert seen["learning_rate"] == 0.0123
    assert all(type(example) is CorpusExample for example in seen["corpus"])
    assert [asdict(example) for example in seen["corpus"]] == corpus

    _assert_epoch_pairs(messages[1:-1], 3)
    assert [m["metrics"] for m in messages if m["type"] == "metrics"] == emitted
    assert messages[-1]["type"] == "completed"


# ── Numeric channel (acceptance criterion) ──────────────────────────────


@pytest.mark.parametrize(
    ("template", "intent"),
    [("roll forward {} cm", "STRAIGHT"), ("back up {} centimeters", "BACKWARDS")],
)
def test_reserved_amounts_generalize(template: str, intent: str) -> None:
    """Amounts never seen in training come back near the sentence's number.

    If the numeric channel had been lost in the wiring, every prediction would
    collapse towards the corpus mean (~79 cm) and the spread check would fail.
    """
    job_id = str(uuid.uuid4())
    sentences = [template.format(amount) for amount in FAR_RESERVED_AMOUNTS]
    with TestClient(app) as client:
        assert _train(client, job_id, [])[-1]["type"] == "completed"
        predictions = _predict(client, job_id, sentences)

    amounts = [item["amount_cm"] for item in predictions]
    print(f"\n{template!r}: {dict(zip(FAR_RESERVED_AMOUNTS, amounts))}")
    assert all(item["intent"] == intent for item in predictions)
    within = [abs(got - want) <= 15 for got, want in zip(amounts, FAR_RESERVED_AMOUNTS)]
    assert sum(within) >= 2
    assert amounts[-1] - amounts[0] > 80


def test_held_out_log_report() -> None:
    """Report (not assert) per-sentence results on the committed held-out log."""
    _, examples = load_test_log()
    job_id = str(uuid.uuid4())
    with TestClient(app) as client:
        assert _train(client, job_id, [])[-1]["type"] == "completed"
        predictions = _predict(client, job_id, [e.sentence for e in examples])

    assert len(predictions) == len(examples)
    correct = 0
    amount_errors: list[float] = []
    print("\nheld-out log (default corpus, lr 0.05 x 50 epochs, seed 0):")
    for example, item in zip(examples, predictions):
        hit = item["intent"] == example.intent
        correct += hit
        truth = example.intent if example.amount_cm is None else f"{example.intent} {int(example.amount_cm)}"
        note = ""
        if hit and example.amount_cm is not None:
            error = abs(item["amount_cm"] - example.amount_cm)
            amount_errors.append(error)
            note = f" (amount err {error:.0f})"
        print(f"  [{'ok ' if hit else 'BAD'}] {item['command']:<14} want {truth:<14}{note}  {example.sentence}")
    mean_error = sum(amount_errors) / len(amount_errors) if amount_errors else float("nan")
    print(
        f"  intent accuracy {correct}/{len(examples)}; mean abs amount error "
        f"{mean_error:.1f} cm over {len(amount_errors)} correctly-classified distance sentences"
    )


# ── Wire -> dataclass conversion ────────────────────────────────────────


def test_to_corpus_examples_converts_valid_examples() -> None:
    wire = [
        WireExample(sentence="roll forward 40 cm", intent="STRAIGHT", amount_cm=40.0),
        WireExample(sentence="back up 5 cm", intent="BACKWARDS", amount_cm=5.0),
        WireExample(sentence="do a 180", intent="TURN_180"),
    ]
    assert train_router._to_corpus_examples(wire) == [
        CorpusExample("roll forward 40 cm", "STRAIGHT", 40.0),
        CorpusExample("back up 5 cm", "BACKWARDS", 5.0),
        CorpusExample("do a 180", "TURN_180", None),
    ]


@pytest.mark.parametrize(
    ("example", "fragment"),
    [
        (WireExample(sentence="go", intent="STRAIGHT"), "require amount_cm"),
        (WireExample(sentence="back", intent="BACKWARDS"), "require amount_cm"),
        (WireExample(sentence="right", intent="TURN_RIGHT", amount_cm=90.0), "must not carry"),
        (WireExample(sentence="left", intent="TURN_LEFT", amount_cm=0.0), "must not carry"),
        (WireExample(sentence="spin", intent="TURN_180", amount_cm=180.0), "must not carry"),
    ],
)
def test_to_corpus_examples_rejects_amount_mismatch(example: WireExample, fragment: str) -> None:
    with pytest.raises(ValueError, match=fragment):
        train_router._to_corpus_examples([example])
