"""Tests for the PR-03 corpus generator and the PR-12 test-log bank.

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
    FINAL_TEST_AMOUNTS,
    GARNISH,
    INTENTS,
    NUMERIC_INTENTS,
    PRACTICE_LOG_ARCS,
    PRACTICE_TEST_AMOUNTS,
    RESERVED_TEST_AMOUNTS,
    TEMPLATES,
    TEST_LOG_SLOTS,
    TURN_INTENTS,
    LogBank,
    TrainingExample,
    generate_corpus,
    generate_test_log,
    generate_test_logs,
    load_base_corpus,
    load_test_log,
    load_test_logs,
    normalize_sentence,
)
from app.services.tokenizer import NUM, _numeral, _tokens

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
    generate_test_logs()
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


# ------------------------------------------------------- test-log bank ------

#: The final-test log exactly as test_log.json held it before PR-12. Students
#: never see it before the final test, and Step 6 grades against it, so it must
#: not drift when the practice tables change.
ORIGINAL_FINAL_MISSION_LOG = (
    "Ease down off the ramp and hold a straight line for 7 centimeters. "
    "Pivot to the right so the solar panel catches the sunrise. "
    "Creep straight ahead another 38 centimeters to line up with the drill hole. "
    "Swap ends so the camera mast faces back down the trail. "
    "Give yourself 143 centimeters of room by backing off the rim. "
    "Haul around to the left and hold there until the telemetry catches up. "
    "Finish the run with 64 centimeters straight ahead to the charging pad."
)
ORIGINAL_FINAL_EXAMPLES = [
    TrainingExample("ease down off the ramp and hold a straight line for 7 centimeters", "STRAIGHT", 7.0),
    TrainingExample("pivot to the right so the solar panel catches the sunrise", "TURN_RIGHT", None),
    TrainingExample("creep straight ahead another 38 centimeters to line up with the drill hole", "STRAIGHT", 38.0),
    TrainingExample("swap ends so the camera mast faces back down the trail", "TURN_180", None),
    TrainingExample("give yourself 143 centimeters of room by backing off the rim", "BACKWARDS", 143.0),
    TrainingExample("haul around to the left and hold there until the telemetry catches up", "TURN_LEFT", None),
    TrainingExample("finish the run with 64 centimeters straight ahead to the charging pad", "STRAIGHT", 64.0),
]


@pytest.fixture(params=["generated", "committed"])
def bank(request: pytest.FixtureRequest) -> LogBank:
    """The test-log bank, both freshly generated and as committed to JSON."""
    if request.param == "generated":
        return generate_test_logs()
    return load_test_logs()


def _trigrams(text: str) -> set[tuple[str, ...]]:
    """Three-word sequences as the model sees them: its own tokenisation, with
    every numeral (including a filled-in ``{cm}`` slot) collapsed to ``<num>``."""
    tokens = [NUM if _numeral(t) is not None else t for t in _tokens(text.replace("{cm}", "50"))]
    return {tuple(tokens[i : i + 3]) for i in range(len(tokens) - 2)}


def _practice_phrasings() -> list[str]:
    return [p for arc in PRACTICE_LOG_ARCS for _, variants in arc for p in variants]


def _shared_trigrams(phrasings: list[str], others: list[str]) -> list[tuple[str, tuple[str, ...]]]:
    banned = set().union(*(_trigrams(o) for o in others))
    return [(p, g) for p in phrasings for g in sorted(_trigrams(p) & banned)]


def test_final_log_is_pinned_to_the_original_test_log(bank: LogBank) -> None:
    final = bank["final"]
    assert final.id == "final"
    assert final.mission_log == ORIGINAL_FINAL_MISSION_LOG
    assert final.examples == ORIGINAL_FINAL_EXAMPLES


def test_load_test_log_returns_the_final_log() -> None:
    assert load_test_log() == (ORIGINAL_FINAL_MISSION_LOG, ORIGINAL_FINAL_EXAMPLES)


def test_bank_has_five_practice_logs_and_a_final(bank: LogBank) -> None:
    assert [log.id for log in bank["practice"]] == [f"practice-{n}" for n in range(1, 6)]
    assert bank["final"].id == "final"


def test_practice_logs_have_six_or_seven_sentences_covering_every_intent(
    bank: LogBank,
) -> None:
    for log in bank["practice"]:
        assert 6 <= len(log.examples) <= 7, log.id
        assert {e.intent for e in log.examples} == set(INTENTS), log.id


def test_practice_arcs_table_shape() -> None:
    spelled_out = re.compile(r"\b(" + "|".join(SPELLED_OUT_NUMBERS) + r")\b", re.IGNORECASE)
    assert len(PRACTICE_LOG_ARCS) == 5
    for arc in PRACTICE_LOG_ARCS:
        assert 6 <= len(arc) <= 7
        assert {intent for intent, _ in arc} == set(INTENTS)
        for intent, variants in arc:
            assert len(variants) >= 2, variants
            for prose in variants:
                # One sentence each: capitalised, a single closing period, no
                # internal commas, so normalize_sentence is the whole contract.
                assert prose[0].isupper() and prose.endswith("."), prose
                assert prose.count(".") == 1 and "," not in prose, prose
                assert not spelled_out.search(prose), prose
                assert ("{cm}" in prose) == (intent in NUMERIC_INTENTS), prose


def test_log_examples_match_their_paragraph_sentences(bank: LogBank) -> None:
    for log in [*bank["practice"], bank["final"]]:
        assert log.mission_log[0].isupper() and log.mission_log.endswith("."), log.id
        assert "\n" not in log.mission_log, log.id
        prose_sentences = [s.strip() for s in log.mission_log.split(".") if s.strip()]
        assert [normalize_sentence(f"{s}.") for s in prose_sentences] == [
            e.sentence for e in log.examples
        ], log.id


def test_log_sentences_are_in_corpus_style(bank: LogBank) -> None:
    for log in [*bank["practice"], bank["final"]]:
        for example in log.examples:
            assert example.sentence == example.sentence.lower(), example
            assert example.sentence == example.sentence.strip(), example
            assert not example.sentence.endswith("."), example
            assert "," not in example.sentence, example


def test_log_sentences_have_at_most_one_numeral(bank: LogBank) -> None:
    # PR-04's numeric channel reads the first numeral, so a second one would
    # be a decoy; a distance sentence's single numeral is its label.
    for log in [*bank["practice"], bank["final"]]:
        for example in log.examples:
            numerals = NUMERAL_RE.findall(example.sentence)
            assert len(numerals) <= 1, example
            if example.intent in NUMERIC_INTENTS:
                assert numerals and int(numerals[0]) == int(example.amount_cm), example
            else:
                assert example.amount_cm is None, example


def test_practice_amounts_are_reserved_and_distinct(bank: LogBank) -> None:
    amounts = [
        e.amount_cm for log in bank["practice"] for e in log.examples if e.amount_cm is not None
    ]
    assert amounts
    for amount in amounts:
        assert amount == int(amount)
        assert int(amount) in RESERVED_TEST_AMOUNTS
        assert int(amount) in PRACTICE_TEST_AMOUNTS
    # Distinct across the whole bank, not just within one log, and never one
    # of the final log's amounts.
    assert len(set(amounts)) == len(amounts)
    assert set(map(int, amounts)).isdisjoint(FINAL_TEST_AMOUNTS)


def test_reserved_amounts_keep_the_final_log_amounts() -> None:
    assert set(FINAL_TEST_AMOUNTS) <= set(RESERVED_TEST_AMOUNTS)
    assert set(PRACTICE_TEST_AMOUNTS) <= set(RESERVED_TEST_AMOUNTS)
    assert set(FINAL_TEST_AMOUNTS).isdisjoint(PRACTICE_TEST_AMOUNTS)
    assert all(AMOUNT_MIN_CM <= cm <= AMOUNT_MAX_CM for cm in RESERVED_TEST_AMOUNTS)
    assert set(CORPUS_AMOUNTS).isdisjoint(RESERVED_TEST_AMOUNTS)


def test_practice_phrasings_share_no_trigram_with_the_final_log_table() -> None:
    # Every final variant, not only the seeded choice: students add practice
    # sentences to their training data, so a shared phrase like "swap ends"
    # would leak into the final test for any seed.
    final_variants = [v for _, variants in TEST_LOG_SLOTS for v in variants]
    assert _shared_trigrams(_practice_phrasings(), final_variants) == []


def test_practice_phrasings_share_no_trigram_with_the_training_templates() -> None:
    # Every template with every garnish covers any sentence generate_corpus can
    # emit, so practice rounds stay a generalization test for any corpus seed.
    corpus_forms = [
        f"{lead}{template}{tail}"
        for templates in TEMPLATES.values()
        for template in templates
        for lead, tail in GARNISH
    ]
    assert _shared_trigrams(_practice_phrasings(), corpus_forms) == []


def test_practice_phrasings_share_no_trigram_with_the_committed_corpus() -> None:
    # The committed corpus may be hand-edited away from the templates.
    committed = [e.sentence for e in load_base_corpus()]
    assert _shared_trigrams(_practice_phrasings(), committed) == []


@pytest.mark.parametrize("corpus_seed", [42, 7, 2024])
@pytest.mark.parametrize("examples_per_intent", [5, 30])
def test_bank_sentences_never_appear_in_the_corpus(
    bank: LogBank, corpus_seed: int, examples_per_intent: int
) -> None:
    corpus_sentences = {
        e.sentence for e in generate_corpus(seed=corpus_seed, examples_per_intent=examples_per_intent)
    }
    corpus_sentences |= {e.sentence for e in load_base_corpus()}
    for log in [*bank["practice"], bank["final"]]:
        for example in log.examples:
            assert example.sentence not in corpus_sentences, example


def test_generate_test_logs_is_deterministic_for_the_same_seed() -> None:
    assert generate_test_logs(seed=123) == generate_test_logs(seed=123)


def test_generate_test_logs_varies_with_the_seed() -> None:
    assert generate_test_logs(seed=123)["practice"] != generate_test_logs(seed=124)["practice"]
