"""Tests for the PR-03 corpus generator.

These cover the schema invariants plus the constraints that exist for PR-04's
benefit and would otherwise fail silently: the one-numeral rule for distance
sentences, digits instead of spelled-out numbers, class balance, seed
determinism, and the held-out test log's non-overlap with the corpus.

The structural tests run twice -- once over freshly generated examples and once
over the committed ``base_corpus.json``. The committed file is deliberately
*not* asserted to be byte-identical to the generator's current output: it is a
first draft that David hand-edits for tone (README, "corpus authoring"), so the
tests check that it still satisfies every contract rather than that it is
untouched.
"""

from __future__ import annotations

import random
import re

import pytest

from app.services.corpus import (
    AMOUNT_MAX_CM,
    AMOUNT_MIN_CM,
    CORPUS_AMOUNTS,
    INTENTS,
    NUMERIC_INTENTS,
    RESERVED_TEST_AMOUNTS,
    TURN_INTENTS,
    TrainingExample,
    generate_corpus,
    generate_test_log,
    load_base_corpus,
    load_test_log,
    normalize_sentence,
)

NUMERAL_RE = re.compile(r"\d+")

#: Spelled-out numbers are unpredictable by construction: PR-04's numeric
#: channel parses numerals, so "forty" yields has_num = 0.
SPELLED_OUT_NUMBERS = (
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "fifteen",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
    "hundred",
)


@pytest.fixture(params=["generated", "committed"])
def corpus(request: pytest.FixtureRequest) -> list[TrainingExample]:
    """The default corpus, both freshly generated and as committed to JSON."""
    if request.param == "generated":
        return generate_corpus()
    return load_base_corpus()


# ---------------------------------------------------------------- schema ----


def test_every_intent_is_in_the_vocabulary(corpus: list[TrainingExample]) -> None:
    assert {e.intent for e in corpus} == set(INTENTS)


def test_amount_is_a_float_for_distances_and_none_for_turns(
    corpus: list[TrainingExample],
) -> None:
    for example in corpus:
        if example.intent in NUMERIC_INTENTS:
            assert isinstance(example.amount_cm, float), example
        else:
            assert example.intent in TURN_INTENTS
            assert example.amount_cm is None, example


def test_amounts_are_whole_numbers_in_range(corpus: list[TrainingExample]) -> None:
    for example in corpus:
        if example.amount_cm is None:
            continue
        assert example.amount_cm == int(example.amount_cm), example
        assert AMOUNT_MIN_CM <= example.amount_cm <= AMOUNT_MAX_CM, example


def test_amounts_are_not_bucketed_into_a_small_fixed_set(
    corpus: list[TrainingExample],
) -> None:
    # The amount head reads a numeric channel, so it handles arbitrary values;
    # a handful of recycled magic numbers would hide that.
    amounts = {e.amount_cm for e in corpus if e.amount_cm is not None}
    assert len(amounts) >= 20, sorted(amounts)


def test_sentences_are_unique(corpus: list[TrainingExample]) -> None:
    sentences = [e.sentence for e in corpus]
    assert len(set(sentences)) == len(sentences)


def test_sentences_are_in_corpus_style(corpus: list[TrainingExample]) -> None:
    # Lowercase, no trailing period: PR-04's tokenizer lowercases and splits on
    # whitespace without stripping punctuation, so "centimeters." would be a
    # distinct token from "centimeters".
    for example in corpus:
        assert example.sentence == example.sentence.lower(), example
        assert not example.sentence.endswith("."), example
        assert example.sentence == example.sentence.strip(), example


# ----------------------------------------------------------- numerals -------


def test_distance_sentences_contain_exactly_one_numeral(
    corpus: list[TrainingExample],
) -> None:
    # PR-04's numeric channel takes the FIRST numeral in the sentence, so a
    # decoy number would be fed to the amount head instead of the distance.
    for example in corpus:
        if example.intent not in NUMERIC_INTENTS:
            continue
        assert len(NUMERAL_RE.findall(example.sentence)) == 1, example


def test_distance_sentence_numeral_matches_its_label(
    corpus: list[TrainingExample],
) -> None:
    for example in corpus:
        if example.intent not in NUMERIC_INTENTS:
            continue
        first_numeral = NUMERAL_RE.search(example.sentence)
        assert first_numeral is not None, example
        assert int(first_numeral.group()) == int(example.amount_cm), example


def test_turn_sentences_include_numerals_as_a_robustness_case(
    corpus: list[TrainingExample],
) -> None:
    # Deliberately the opposite of the rule above: a numeral must not imply a
    # distance, so the intent head has to see numerals in turn contexts too.
    with_numerals = [
        e
        for e in corpus
        if e.intent in TURN_INTENTS and NUMERAL_RE.search(e.sentence)
    ]
    assert len(with_numerals) >= 2, "turn sentences carry no numerals at all"
    assert {e.intent for e in with_numerals} == set(TURN_INTENTS)


def test_no_spelled_out_numbers_anywhere(corpus: list[TrainingExample]) -> None:
    pattern = re.compile(r"\b(" + "|".join(SPELLED_OUT_NUMBERS) + r")\b")
    offenders = [e.sentence for e in corpus if pattern.search(e.sentence)]
    assert offenders == []


# ------------------------------------------------------------ balance -------


def test_class_counts_are_balanced(corpus: list[TrainingExample]) -> None:
    counts = {intent: sum(1 for e in corpus if e.intent == intent) for intent in INTENTS}
    mean = sum(counts.values()) / len(counts)
    for intent, count in counts.items():
        assert count >= 0.6 * mean, (intent, counts)


@pytest.mark.parametrize("examples_per_intent", [1, 5, 30, 47])
def test_examples_per_intent_is_respected_exactly(examples_per_intent: int) -> None:
    generated = generate_corpus(examples_per_intent=examples_per_intent)
    assert len(generated) == examples_per_intent * len(INTENTS)
    for intent in INTENTS:
        assert sum(1 for e in generated if e.intent == intent) == examples_per_intent


def test_oversized_request_raises_rather_than_emitting_duplicates() -> None:
    with pytest.raises(ValueError, match="exceeds"):
        generate_corpus(examples_per_intent=10_000)


def test_non_positive_size_is_rejected() -> None:
    with pytest.raises(ValueError):
        generate_corpus(examples_per_intent=0)


# ------------------------------------------------------- determinism --------


def test_generate_corpus_is_deterministic_for_the_same_seed() -> None:
    assert generate_corpus(seed=42) == generate_corpus(seed=42)


def test_generate_corpus_varies_with_the_seed() -> None:
    assert generate_corpus(seed=42) != generate_corpus(seed=43)


def test_generate_test_log_is_deterministic_for_the_same_seed() -> None:
    assert generate_test_log(seed=123) == generate_test_log(seed=123)


def test_generate_test_log_varies_with_the_seed() -> None:
    assert generate_test_log(seed=123) != generate_test_log(seed=124)


def test_generators_do_not_touch_the_global_random_module() -> None:
    # Module-level global state would leak across calls and make determinism
    # depend on test order; both generators must use random.Random(seed).
    random.seed(1234)
    expected = random.random()

    random.seed(1234)
    generate_corpus()
    generate_test_log()
    assert random.random() == expected


# -------------------------------------------------------- held-out log ------


def test_test_log_covers_every_intent() -> None:
    _, examples = generate_test_log()
    assert {e.intent for e in examples} == set(INTENTS)


def test_test_log_paragraph_is_narrative_prose() -> None:
    mission_log, examples = generate_test_log()
    assert mission_log.endswith(".")
    assert mission_log[0].isupper()
    assert "\n" not in mission_log
    # Narrative, not a command list: comfortably longer than its labels.
    assert len(mission_log) > sum(len(e.sentence) for e in examples)


def test_test_log_examples_match_the_paragraph_sentences() -> None:
    # The entire contract PR-09 needs: split the paragraph on sentences, apply
    # normalize_sentence, and the ground-truth sentence matches exactly.
    mission_log, examples = generate_test_log()
    prose_sentences = [s.strip() for s in mission_log.split(".") if s.strip()]
    assert len(prose_sentences) == len(examples)
    assert [normalize_sentence(f"{s}.") for s in prose_sentences] == [
        e.sentence for e in examples
    ]


def test_test_log_has_one_command_per_sentence() -> None:
    # Per-sentence ground truth is only well defined if a sentence carries a
    # single command, so a distance sentence must hold exactly one numeral.
    _, examples = generate_test_log()
    for example in examples:
        if example.intent in NUMERIC_INTENTS:
            assert len(NUMERAL_RE.findall(example.sentence)) == 1, example


def test_test_log_amounts_are_whole_numbers_from_the_reserved_set() -> None:
    _, examples = generate_test_log()
    amounts = [e.amount_cm for e in examples if e.amount_cm is not None]
    assert amounts, "the test log carries no distance commands"
    for amount in amounts:
        assert amount == int(amount)
        assert int(amount) in RESERVED_TEST_AMOUNTS


def test_reserved_amounts_are_excluded_from_the_corpus_pool() -> None:
    # This is what makes non-overlap structural rather than a lucky seed.
    assert set(CORPUS_AMOUNTS).isdisjoint(RESERVED_TEST_AMOUNTS)


@pytest.mark.parametrize("corpus_seed", [42, 7, 2024])
@pytest.mark.parametrize("examples_per_intent", [5, 30])
@pytest.mark.parametrize("log_seed", [123, 999])
def test_test_log_amounts_never_appear_in_the_corpus(
    corpus_seed: int, examples_per_intent: int, log_seed: int
) -> None:
    generated = generate_corpus(seed=corpus_seed, examples_per_intent=examples_per_intent)
    _, examples = generate_test_log(seed=log_seed)
    corpus_amounts = {e.amount_cm for e in generated if e.amount_cm is not None}
    log_amounts = {e.amount_cm for e in examples if e.amount_cm is not None}
    assert corpus_amounts.isdisjoint(log_amounts)


@pytest.mark.parametrize("corpus_seed", [42, 7, 2024])
@pytest.mark.parametrize("examples_per_intent", [5, 30])
@pytest.mark.parametrize("log_seed", [123, 999])
def test_test_log_sentences_never_appear_in_the_corpus(
    corpus_seed: int, examples_per_intent: int, log_seed: int
) -> None:
    generated = generate_corpus(seed=corpus_seed, examples_per_intent=examples_per_intent)
    _, examples = generate_test_log(seed=log_seed)
    corpus_sentences = {e.sentence for e in generated}
    for example in examples:
        assert example.sentence not in corpus_sentences, example


def test_committed_test_log_matches_the_generator_contract() -> None:
    mission_log, examples = load_test_log()
    assert mission_log.strip()
    assert {e.intent for e in examples} == set(INTENTS)
    prose_sentences = [s.strip() for s in mission_log.split(".") if s.strip()]
    assert [normalize_sentence(f"{s}.") for s in prose_sentences] == [
        e.sentence for e in examples
    ]
    corpus_amounts = {e.amount_cm for e in load_base_corpus() if e.amount_cm is not None}
    log_amounts = {e.amount_cm for e in examples if e.amount_cm is not None}
    assert corpus_amounts.isdisjoint(log_amounts)


def test_committed_corpus_is_the_documented_default_size() -> None:
    # Catches a committed file that was never regenerated after a template or
    # size change, without freezing its hand-edited content.
    assert len(load_base_corpus()) == 150
