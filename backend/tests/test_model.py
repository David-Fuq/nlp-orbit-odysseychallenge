"""Tests for the PR-04 tokenizer and intent/amount model.

Uses a small hand-written fixture corpus, not PR-03's generator: these tests
are about the architecture and its contracts, independent of corpus content.

Weight init is random, so an autouse fixture seeds torch before every test.
Training is full-batch, so with the seed fixed nothing else is stochastic.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import pytest
import torch

from app.services import corpus
from app.services.corpus import TrainingExample
from app.services.model import (
    INTENT_LABELS,
    METRIC_KEYS,
    IntentAmountModel,
    TrainedModel,
    _encode_batch,
    predict,
    train_model,
)
from app.services.tokenizer import NUM, NUM_ID, PAD_ID, UNK_ID, Tokenizer

BACKEND_DIR = Path(__file__).resolve().parents[1]

S, B = "STRAIGHT", "BACKWARDS"

#: 20 examples, all five intents. Distances use only 20/40/60 cm, so 30 and 50
#: are unseen. Turn sentences deliberately carry numerals ("90", "180").
FIXTURE: list[TrainingExample] = [
    TrainingExample("go forward 20 cm", S, 20.0),
    TrainingExample("go forward 40 cm", S, 40.0),
    TrainingExample("go forward 60 cm", S, 60.0),
    TrainingExample("roll ahead 20 centimeters", S, 20.0),
    TrainingExample("roll ahead 60 centimeters", S, 60.0),
    TrainingExample("go forward 40 centimeters", S, 40.0),
    TrainingExample("back up 20 cm", B, 20.0),
    TrainingExample("back up 40 cm", B, 40.0),
    TrainingExample("reverse 60 centimeters", B, 60.0),
    TrainingExample("back up 60 centimeters", B, 60.0),
    TrainingExample("reverse 20 cm", B, 20.0),
    TrainingExample("turn left", "TURN_LEFT", None),
    TrainingExample("rotate 90 degrees to the left", "TURN_LEFT", None),
    TrainingExample("make a left turn", "TURN_LEFT", None),
    TrainingExample("turn right", "TURN_RIGHT", None),
    TrainingExample("rotate 90 degrees to the right", "TURN_RIGHT", None),
    TrainingExample("make a right turn", "TURN_RIGHT", None),
    TrainingExample("do a 180", "TURN_180", None),
    TrainingExample("spin 180 around", "TURN_180", None),
    TrainingExample("turn all the way around", "TURN_180", None),
]

EPOCHS = 100
LEARNING_RATE = 0.05


@pytest.fixture(autouse=True)
def _seed() -> None:
    torch.manual_seed(0)


@pytest.fixture
def history() -> list[dict]:
    return []


@pytest.fixture
def trained(history: list[dict]) -> TrainedModel:
    return train_model(FIXTURE, EPOCHS, LEARNING_RATE, history.append)


def _predict(trained: TrainedModel, sentence: str) -> dict:
    return predict(trained.model, trained.tokenizer, sentence)


# --------------------------------------------------------------------------
# Tokenizer
# --------------------------------------------------------------------------


@pytest.fixture
def tokenizer() -> Tokenizer:
    return Tokenizer.build([example.sentence for example in FIXTURE])


def test_build_puts_no_numerals_in_vocab(tokenizer: Tokenizer) -> None:
    assert not any(any(ch.isdigit() for ch in token) for token in tokenizer.vocab)
    assert tokenizer.vocab[NUM] == NUM_ID


def test_reserved_ids_and_vocab_size(tokenizer: Tokenizer) -> None:
    assert (tokenizer.vocab["<pad>"], tokenizer.vocab["<unk>"], tokenizer.vocab["<num>"]) == (
        PAD_ID,
        UNK_ID,
        NUM_ID,
    )
    assert tokenizer.vocab_size == len(tokenizer.vocab)
    assert sorted(tokenizer.vocab.values()) == list(range(tokenizer.vocab_size))


def test_build_is_order_independent() -> None:
    sentences = [example.sentence for example in FIXTURE]
    assert Tokenizer.build(sentences).vocab == Tokenizer.build(sentences[::-1]).vocab


def test_encode_numeral_sets_numeric_channel(tokenizer: Tokenizer) -> None:
    ids, num_value, has_num = tokenizer.encode("go 40 cm")
    assert has_num == 1.0
    assert num_value == pytest.approx(0.4)
    assert ids[1] == NUM_ID


def test_encode_without_numeral(tokenizer: Tokenizer) -> None:
    ids, num_value, has_num = tokenizer.encode("turn left")
    assert (num_value, has_num) == (0.0, 0.0)
    assert UNK_ID not in ids and NUM_ID not in ids


@pytest.mark.parametrize(
    ("text", "expected"), [("go 40, now", 0.4), ("go 40.", 0.4), ("go 12.5 cm", 0.125)]
)
def test_numeral_test_strips_edge_punctuation_and_accepts_floats(
    tokenizer: Tokenizer, text: str, expected: float
) -> None:
    ids, num_value, has_num = tokenizer.encode(text)
    assert has_num == 1.0
    assert num_value == pytest.approx(expected)
    assert NUM_ID in ids


def test_nan_and_inf_are_words_not_numerals(tokenizer: Tokenizer) -> None:
    assert tokenizer.encode("nan inf")[2] == 0.0


def test_vocab_lookup_strips_edge_punctuation(tokenizer: Tokenizer) -> None:
    assert tokenizer.encode("Turn left.") == tokenizer.encode("turn left")
    assert tokenizer.encode('"Turn, left!"') == tokenizer.encode("turn left")


def test_internal_punctuation_is_kept(tokenizer: Tokenizer) -> None:
    built = Tokenizer.build(["rotate counter-clockwise"])
    assert "counter-clockwise" in built.vocab
    assert "counter" not in built.vocab


def test_unknown_word_maps_to_unk(tokenizer: Tokenizer) -> None:
    ids, _, _ = tokenizer.encode("zigzag left")
    assert ids[0] == UNK_ID


def test_first_numeral_wins(tokenizer: Tokenizer) -> None:
    ids, num_value, _ = tokenizer.encode("go 40 cm past rock 3")
    assert num_value == pytest.approx(0.4)
    assert ids.count(NUM_ID) == 2


# --------------------------------------------------------------------------
# Labels and wiring
# --------------------------------------------------------------------------


def test_intent_label_set_matches_corpus() -> None:
    assert set(INTENT_LABELS) == set(corpus.INTENTS)
    assert len(INTENT_LABELS) == len(set(INTENT_LABELS))


def test_intent_head_ignores_numeric_channel(tokenizer: Tokenizer) -> None:
    model = IntentAmountModel(tokenizer.vocab_size)
    token_ids, pad_mask, num_feats = _encode_batch(tokenizer, ["do a 180"])
    logits_a, amount_a = model(token_ids, pad_mask, num_feats)
    logits_b, amount_b = model(token_ids, pad_mask, torch.tensor([[9.0, 0.0]]))
    assert torch.equal(logits_a, logits_b)
    assert not torch.equal(amount_a, amount_b)  # ...but the amount head does read it


def test_mean_pool_ignores_padding(tokenizer: Tokenizer) -> None:
    model = IntentAmountModel(tokenizer.vocab_size)
    alone = _encode_batch(tokenizer, ["turn left"])
    padded = _encode_batch(tokenizer, ["turn left", "rotate 90 degrees to the left now"])
    logits_alone, amount_alone = model(*alone)
    logits_padded, amount_padded = model(*padded)
    assert torch.allclose(logits_alone[0], logits_padded[0], atol=1e-6)
    assert torch.allclose(amount_alone[0], amount_padded[0], atol=1e-6)


def test_empty_sentence_does_not_nan(trained: TrainedModel) -> None:
    result = _predict(trained, "")
    assert result["intent"] in INTENT_LABELS


# --------------------------------------------------------------------------
# Training
# --------------------------------------------------------------------------


def test_training_improves_intent_metrics(trained: TrainedModel, history: list[dict]) -> None:
    first, last = history[0], history[-1]
    print(
        f"\nepoch 1: intent_loss={first['intent_loss']:.4f} "
        f"acc={first['intent_accuracy']:.3f} amount_loss={first['amount_loss']:.4f}"
        f"\nepoch {last['epoch']}: intent_loss={last['intent_loss']:.6f} "
        f"acc={last['intent_accuracy']:.3f} amount_loss={last['amount_loss']:.6f}"
    )
    assert last["intent_accuracy"] > first["intent_accuracy"]
    assert last["intent_loss"] < first["intent_loss"]
    assert last["amount_loss"] < first["amount_loss"]


def test_callback_called_once_per_epoch_with_documented_keys(history: list[dict]) -> None:
    train_model(FIXTURE, 7, LEARNING_RATE, history.append)
    assert len(history) == 7
    assert [m["epoch"] for m in history] == list(range(1, 8))
    for metrics in history:
        assert tuple(metrics) == METRIC_KEYS
        assert all(type(metrics[key]) is float for key in METRIC_KEYS[1:])
        assert 0.0 <= metrics["intent_accuracy"] <= 1.0


def test_amount_loss_is_scaled(history: list[dict]) -> None:
    # Raw centimeter targets (20..60) would put the first-epoch MSE in the
    # hundreds-to-thousands; scaled targets keep it the same order as CE.
    train_model(FIXTURE, 1, LEARNING_RATE, history.append)
    assert history[0]["amount_loss"] < 5.0


def test_amount_loss_is_zero_without_distance_rows(history: list[dict]) -> None:
    turns = [example for example in FIXTURE if example.intent not in corpus.NUMERIC_INTENTS]
    train_model(turns, 3, LEARNING_RATE, history.append)
    assert [m["amount_loss"] for m in history] == [0.0, 0.0, 0.0]


def test_train_without_callback_returns_trained_model() -> None:
    result = train_model(FIXTURE, 3, LEARNING_RATE)
    assert isinstance(result, TrainedModel)
    assert isinstance(result.model, IntentAmountModel)
    assert isinstance(result.tokenizer, Tokenizer)
    assert not result.model.training


@pytest.mark.parametrize(
    ("corpus_", "epochs", "lr"), [([], 5, 0.05), (FIXTURE, 0, 0.05), (FIXTURE, 5, 0.0)]
)
def test_train_rejects_bad_arguments(corpus_: list, epochs: int, lr: float) -> None:
    with pytest.raises(ValueError):
        train_model(corpus_, epochs, lr)


def test_training_is_fast() -> None:
    train_model(FIXTURE, 1, LEARNING_RATE)  # warm up torch's one-time init
    start = time.perf_counter()
    train_model(FIXTURE, 50, LEARNING_RATE)
    elapsed = time.perf_counter() - start
    print(f"\n20 examples x 50 epochs: {elapsed * 1000:.1f} ms")
    assert elapsed < 1.0


def test_model_module_does_not_import_fastapi() -> None:
    code = "import sys, app.services.model; print('fastapi' in sys.modules)"
    out = subprocess.run(
        [sys.executable, "-W", "ignore", "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    assert out.stdout.strip() == "False"


# --------------------------------------------------------------------------
# Prediction
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("sentence", "intent"),
    [
        ("go forward 40 cm", "STRAIGHT"),
        ("back up 40 centimeters", "BACKWARDS"),
        ("turn left", "TURN_LEFT"),
        ("make a right turn", "TURN_RIGHT"),
        ("turn all the way around", "TURN_180"),
    ],
)
def test_predict_near_training_example(trained: TrainedModel, sentence: str, intent: str) -> None:
    assert _predict(trained, sentence)["intent"] == intent


def test_amount_presence_follows_intent(trained: TrainedModel) -> None:
    for example in FIXTURE:
        result = _predict(trained, example.sentence)
        assert set(result) == {"intent", "amount_cm", "command"}
        if result["intent"] in corpus.NUMERIC_INTENTS:
            assert isinstance(result["amount_cm"], float)
            assert result["command"] == f"{result['intent']} {int(result['amount_cm'])}"
        else:
            assert result["amount_cm"] is None
            assert result["command"] in {"TURN LEFT", "TURN RIGHT", "TURN 180"}


def test_numeral_in_turn_sentence_is_not_a_distance(trained: TrainedModel) -> None:
    result = _predict(trained, "do a 180")
    print(f"\npredict('do a 180') -> {result}")
    assert result == {"intent": "TURN_180", "amount_cm": None, "command": "TURN 180"}


def test_unseen_amount_generalizes(trained: TrainedModel) -> None:
    result = _predict(trained, "go forward 50 cm")
    print(f"\nunseen 50 cm -> {result}")
    assert result["intent"] == "STRAIGHT"
    assert result["amount_cm"] == pytest.approx(50, abs=15)


def test_unseen_amounts_track_magnitude(trained: TrainedModel) -> None:
    # The training mean is 40, which is itself within +-15 of 50, so the test
    # above alone cannot tell a working numeric channel from mean collapse.
    # Two unseen amounts must come out ordered and well apart.
    low = _predict(trained, "go forward 30 cm")["amount_cm"]
    high = _predict(trained, "go forward 50 cm")["amount_cm"]
    print(f"\nunseen 30 cm -> {low}, unseen 50 cm -> {high}")
    assert high - low > 10
