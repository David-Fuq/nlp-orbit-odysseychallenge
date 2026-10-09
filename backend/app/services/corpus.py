"""
app.services.corpus
-------------------
Template-based generator for the labeled training corpus and the held-out
test mission log.

Pure data generation: ``random``, ``dataclasses``, ``json``, ``pathlib``, and
nothing else. There is deliberately **no ML framework dependency here** -- the
tokenizer and the model arrive in PR-04, which is why this module is sequenced
first. Do not add ``torch``/``numpy`` imports to it.

Contracts this module implements (``pr-based-plan/README.md``):

- Five intents, three of which carry no numeric slot.
- ``amount_cm`` is a free numeric value, whole centimeters sampled from
  ``5..150`` -- *not* bucketed into a small fixed set. The amount head reads
  the sentence's numeral through a dedicated numeric channel, so arbitrary
  values are predictable.
- Sentences use **digits** (``"40"``), never spelled-out words (``"forty"``):
  the numeric channel parses numerals, so a spelled-out amount silently
  becomes ``has_num = 0`` and is unpredictable by construction.
- **At most one numeral per STRAIGHT/BACKWARDS sentence.** PR-04's numeric
  channel takes the *first* numeral in the sentence, so a decoy number
  ("go 40 cm past the 3rd crater") would feed ``3`` to the amount head.
- **Turn templates deliberately DO carry numerals** ("do a 180", "rotate 90
  degrees to the right"). These are robustness cases proving a numeral does
  not imply a distance: the amount loss is masked for turn intents and
  ``predict()`` discards the amount head's output for them. The two rules
  above are opposites and both are intended -- do not harmonize them.

The generated sentences are a **first draft**. David reviews and hand-edits
them for tone before they are treated as final content, so the template tables
below are meant to be read and edited by a human, and the JSON is formatted
one example per line to keep that review and its diff legible.
"""

from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass
from itertools import product
from pathlib import Path
from typing import Any, Iterable, Literal, Optional, Sequence

Intent = Literal["STRAIGHT", "BACKWARDS", "TURN_RIGHT", "TURN_LEFT", "TURN_180"]


@dataclass
class TrainingExample:
    """One labeled sentence.

    ``amount_cm`` is a float iff ``intent`` is ``STRAIGHT`` or ``BACKWARDS``,
    and ``None`` for the three turn intents, which rotate by a fixed angle.

    NOTE: ``app.schemas.TrainingExample`` is a *pydantic* model with these same
    three fields. That one is the HTTP wire contract (PR-02, consumed by
    PR-06's frontend client); this one is the internal data structure the plan
    specifies for the generator and the trainer. The duplication is
    intentional -- see the PR-03 description for the recommended conversion
    direction in PR-05.
    """

    sentence: str
    intent: Intent
    amount_cm: Optional[float]


INTENTS: tuple[Intent, ...] = (
    "STRAIGHT",
    "BACKWARDS",
    "TURN_RIGHT",
    "TURN_LEFT",
    "TURN_180",
)

#: The two intents that carry a numeric slot.
NUMERIC_INTENTS: tuple[Intent, ...] = ("STRAIGHT", "BACKWARDS")

#: The three fixed-angle intents. These never carry an ``amount_cm``.
TURN_INTENTS: tuple[Intent, ...] = ("TURN_RIGHT", "TURN_LEFT", "TURN_180")

AMOUNT_MIN_CM = 5
AMOUNT_MAX_CM = 150

#: Amounts held back from the corpus so the test log is a *generalization*
#: test rather than a memorization check. Excluding them from the corpus pool
#: makes the no-overlap guarantee structural: it holds for every corpus seed
#: and every ``examples_per_intent``, not just the seeded defaults.
RESERVED_TEST_AMOUNTS: tuple[int, ...] = (7, 26, 38, 64, 81, 97, 118, 143)

#: Whole centimeters available to ``generate_corpus``.
CORPUS_AMOUNTS: tuple[int, ...] = tuple(
    cm
    for cm in range(AMOUNT_MIN_CM, AMOUNT_MAX_CM + 1)
    if cm not in RESERVED_TEST_AMOUNTS
)

# --------------------------------------------------------------------------
# Templates
#
# Style, following the README's wire example (roll forward 40 centimeters):
# lowercase, no trailing period, no internal commas. PR-04's tokenizer is
# "lowercase, whitespace split" with no punctuation stripping, so a trailing
# period would glue onto the token -- "centimeters." is not "centimeters".
#
# Distance templates contain exactly one numeral: the {cm} slot. Turn
# templates intentionally include a few numerals; note that 90 appears for
# both TURN_RIGHT and TURN_LEFT, so the numeral alone cannot discriminate
# direction and the model has to read the direction word.
# --------------------------------------------------------------------------

TEMPLATES: dict[Intent, tuple[str, ...]] = {
    "STRAIGHT": (
        "go straight ahead for {cm} centimeters",
        "roll forward {cm} cm",
        "advance {cm} centimeters toward the ridge",
        "move ahead by {cm} cm",
        "creep straight on another {cm} centimeters",
        "push forward {cm} cm to the sample site",
        "drive straight {cm} centimeters until the terrain levels out",
    ),
    "BACKWARDS": (
        "back up {cm} centimeters",
        "reverse {cm} cm away from the crater rim",
        "roll backwards {cm} centimeters",
        "retreat {cm} cm to clear the lander leg",
        "ease back {cm} centimeters",
        "pull back by {cm} cm",
        "reverse straight out {cm} centimeters along your own tracks",
    ),
    "TURN_RIGHT": (
        "turn right",
        "pivot right toward the comms tower",
        "rotate clockwise",
        "rotate 90 degrees to the right",
        "swing right to face the ridge",
        "make a right turn",
        "yaw right 90 degrees",
    ),
    "TURN_LEFT": (
        "turn left",
        "pivot left toward the relay dish",
        "rotate counter-clockwise",
        "rotate 90 degrees to the left",
        "swing left until the dish is lined up",
        "make a left turn",
        "yaw left 90 degrees",
    ),
    "TURN_180": (
        "do a 180",
        "spin 180 around",
        "turn all the way around",
        "reverse your heading",
        "spin around to face the other way",
        "about face",
        "turn 180 degrees to face back the way you came",
    ),
}

#: Optional sentence openers. Strictly numeral-free, so they can never disturb
#: the "first numeral in the sentence wins" rule for distance templates.
LEAD_INS: tuple[str, ...] = ("", "then ", "now ", "from here ", "next ")

#: Optional sentence closers. Also strictly numeral-free.
TAIL_OFFS: tuple[str, ...] = (
    "",
    " and hold position",
    " before you continue",
    " and wait for the go-ahead",
)

#: Every (opener, closer) pair. This is what gives the three turn intents --
#: which have no numeric slot to vary -- enough distinct surface forms to fill
#: a 30-example class without repeating a sentence.
GARNISH: tuple[tuple[str, str], ...] = tuple(product(LEAD_INS, TAIL_OFFS))

# --------------------------------------------------------------------------
# Held-out test mission log
#
# A fixed seven-command mission arc covering all five intents, with several
# held-out phrasings per slot so a different seed yields different prose.
# Astronaut-voice narrative, modelled on NEW_MISSION_LOG in
# frontend/src/lib/nlp/data.ts.
#
# Two deliberate shape rules:
#   1. One command per sentence. NEW_MISSION_LOG packs two commands into a
#      single sentence, which makes per-sentence ground truth ill-defined.
#   2. Every sentence normalises to its ground-truth sentence by lower() plus
#      dropping the trailing period -- nothing else (hence no internal
#      commas). ``normalize_sentence`` below is that contract, for PR-09.
#
# These phrasings are deliberately NOT drawn from TEMPLATES above: turn
# sentences carry no amount to separate them from the corpus, so their wording
# has to do it.
# --------------------------------------------------------------------------

TEST_LOG_SLOTS: tuple[tuple[Intent, tuple[str, ...]], ...] = (
    (
        "STRAIGHT",
        (
            "Roll out of the airlock and head straight for {cm} centimeters until the dust settles.",
            "Ease down off the ramp and hold a straight line for {cm} centimeters.",
            "Start the traverse by tracking straight ahead {cm} centimeters across open regolith.",
        ),
    ),
    (
        "TURN_RIGHT",
        (
            "Pivot to the right so the solar panel catches the sunrise.",
            "Bring your nose around to the right until the ridgeline sits off your shoulder.",
            "Crank a right turn and square up on the survey marker.",
        ),
    ),
    (
        "STRAIGHT",
        (
            "Creep straight ahead another {cm} centimeters to line up with the drill hole.",
            "Carry on straight for {cm} centimeters until the ground firms up again.",
            "Press on {cm} centimeters more and stop just short of the rille.",
        ),
    ),
    (
        "TURN_180",
        (
            "Turn yourself all the way around to check the tracks you just left.",
            "Swap ends so the camera mast faces back down the trail.",
            "Come about a full 180 and take a long look at where you came from.",
        ),
    ),
    (
        "BACKWARDS",
        (
            "Ease back {cm} centimeters so the sample arm has room to swing.",
            "Walk it back {cm} centimeters until the tray clears the boulder.",
            "Give yourself {cm} centimeters of room by backing off the rim.",
        ),
    ),
    (
        "TURN_LEFT",
        (
            "Swing to your left until the relay dish is dead ahead.",
            "Bear left so the antenna has a clean line to the orbiter.",
            "Haul around to the left and hold there until the telemetry catches up.",
        ),
    ),
    (
        "STRAIGHT",
        (
            "Push on {cm} centimeters more and park at the beacon.",
            "Finish the run with {cm} centimeters straight ahead to the charging pad.",
            "Close out the leg by rolling {cm} centimeters up to the flag.",
        ),
    ),
)

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parent / "data"
BASE_CORPUS_PATH = DATA_DIR / "base_corpus.json"
TEST_LOG_PATH = DATA_DIR / "test_log.json"


def normalize_sentence(sentence: str) -> str:
    """Normalise a prose sentence to corpus style.

    The whole contract between the narrative ``mission_log`` paragraph and the
    ground-truth ``sentence`` strings: lowercase, drop one trailing period.
    PR-09 should call this (or reproduce exactly this) before matching a
    sentence it split out of the paragraph against the ground truth.
    """
    return sentence.lower().removesuffix(".")


def _shuffled(rng: random.Random, items: Iterable[Any]) -> list[Any]:
    """A shuffled copy of *items*, drawn from *rng* only."""
    deck = list(items)
    rng.shuffle(deck)
    return deck


def _examples_for_intent(
    rng: random.Random, intent: Intent, count: int
) -> list[TrainingExample]:
    """Build *count* examples for one intent.

    Templates are used round-robin (example ``i`` takes ``templates[i % T]``)
    so coverage stays even no matter how *count* divides. Each template then
    draws from its *own* shuffled deck at index ``i // T``, which makes every
    sentence unique without a retry loop and keeps the whole thing a pure
    function of *rng*.
    """
    templates = TEMPLATES[intent]
    stride = len(templates)
    numeric = intent in NUMERIC_INTENTS
    variations = len(CORPUS_AMOUNTS) if numeric else len(GARNISH)

    capacity = stride * variations
    if count > capacity:
        raise ValueError(
            f"examples_per_intent={count} exceeds the {capacity} distinct "
            f"sentences available for {intent} ({stride} templates x "
            f"{variations} variations). Add templates to TEMPLATES[{intent!r}] "
            "to raise the ceiling."
        )

    # One deck per template, so repeated uses of a template never collide.
    amount_decks = {t: _shuffled(rng, CORPUS_AMOUNTS) for t in templates}
    garnish_decks = {t: _shuffled(rng, GARNISH) for t in templates}

    examples: list[TrainingExample] = []
    for i in range(count):
        template = templates[i % stride]
        draw = i // stride
        if numeric:
            amount = amount_decks[template][draw]
            lead, tail = garnish_decks[template][draw % len(GARNISH)]
            sentence = f"{lead}{template.format(cm=amount)}{tail}"
            examples.append(TrainingExample(sentence, intent, float(amount)))
        else:
            lead, tail = garnish_decks[template][draw]
            examples.append(TrainingExample(f"{lead}{template}{tail}", intent, None))
    return examples


def generate_corpus(
    seed: int = 42, examples_per_intent: int = 30
) -> list[TrainingExample]:
    """Generate a balanced labeled corpus across the five intents.

    Exactly *examples_per_intent* examples per intent, so the default set is
    perfectly balanced -- PR-07 teaches dataset balance by letting students
    create and fix imbalance themselves, which only works if the seeded
    default is not already lopsided.

    Examples are returned **grouped by intent** in ``INTENTS`` order, because
    the committed JSON is reviewed and hand-edited class by class. Consumers
    that train in minibatches must shuffle first; order is irrelevant for
    full-batch gradient descent.

    Deterministic for a given *seed*: all randomness comes from a local
    ``random.Random`` instance, never the global ``random`` module, so calling
    this neither perturbs nor is perturbed by anything else.
    """
    if examples_per_intent < 1:
        raise ValueError("examples_per_intent must be >= 1")

    rng = random.Random(seed)
    corpus: list[TrainingExample] = []
    for intent in INTENTS:
        corpus.extend(_examples_for_intent(rng, intent, examples_per_intent))
    return corpus


def generate_test_log(seed: int = 123) -> tuple[str, list[TrainingExample]]:
    """Generate the held-out test mission log and its ground-truth labels.

    Returns ``(mission_log, examples)`` where *mission_log* is one narrative
    astronaut-voice paragraph and *examples* carries one ``TrainingExample``
    per sentence in it, in order. This is Step 5's held-out set (PR-09).

    It does not overlap ``generate_corpus()`` by construction, not by luck:
    its amounts come from ``RESERVED_TEST_AMOUNTS``, which the corpus pool
    excludes, and its phrasings are a separate table from ``TEMPLATES``.
    """
    rng = random.Random(seed)
    numeric_slots = sum(1 for intent, _ in TEST_LOG_SLOTS if intent in NUMERIC_INTENTS)
    amounts = rng.sample(RESERVED_TEST_AMOUNTS, k=numeric_slots)

    sentences: list[str] = []
    examples: list[TrainingExample] = []
    for intent, variants in TEST_LOG_SLOTS:
        prose = rng.choice(variants)
        if intent in NUMERIC_INTENTS:
            amount = amounts.pop(0)
            prose = prose.format(cm=amount)
            amount_cm: Optional[float] = float(amount)
        else:
            amount_cm = None
        sentences.append(prose)
        examples.append(TrainingExample(normalize_sentence(prose), intent, amount_cm))

    return " ".join(sentences), examples


# --------------------------------------------------------------------------
# JSON I/O
# --------------------------------------------------------------------------


def _to_dict(example: TrainingExample) -> dict[str, Any]:
    return asdict(example)


def _from_dict(payload: dict[str, Any]) -> TrainingExample:
    amount = payload["amount_cm"]
    return TrainingExample(
        sentence=payload["sentence"],
        intent=payload["intent"],
        amount_cm=None if amount is None else float(amount),
    )


def _format_example_array(
    examples: Sequence[TrainingExample], indent: str, group_by_intent: bool = False
) -> str:
    """Render examples as a JSON array, one example per line.

    ``json.dumps(indent=2)`` spreads each example over four lines, which buries
    150 examples in 600 lines of punctuation. One line per example keeps the
    file scannable by eye and its diffs readable.

    *group_by_intent* adds a blank line wherever the intent changes -- still
    valid JSON, and useful for the class-grouped corpus. It is off for the test
    log, whose intents alternate every row by design.
    """
    rows: list[str] = []
    last = len(examples) - 1
    for i, example in enumerate(examples):
        if group_by_intent and i and examples[i - 1].intent != example.intent:
            rows.append("")
        comma = "," if i < last else ""
        row = json.dumps(_to_dict(example), ensure_ascii=False)
        rows.append(f"{indent}{row}{comma}")
    closing = indent[:-2]
    return "[\n" + "\n".join(rows) + f"\n{closing}]"


def dumps_corpus(examples: Sequence[TrainingExample]) -> str:
    """Serialise a corpus as a bare JSON array.

    Bare array, not an object: this is exactly ``POST /api/train``'s ``corpus``
    field, so PR-05 can load the file and send it without reshaping.
    """
    return _format_example_array(examples, indent="  ", group_by_intent=True) + "\n"


def dumps_test_log(mission_log: str, examples: Sequence[TrainingExample]) -> str:
    """Serialise the test log as ``{"mission_log": ..., "examples": [...]}``."""
    body = _format_example_array(examples, indent="    ")
    return (
        "{\n"
        f'  "mission_log": {json.dumps(mission_log, ensure_ascii=False)},\n'
        f'  "examples": {body}\n'
        "}\n"
    )


def load_base_corpus() -> list[TrainingExample]:
    """Read the committed ``base_corpus.json``.

    Lets PR-05/PR-07 point at the default seed corpus without re-running the
    generator or hardcoding this directory.
    """
    with BASE_CORPUS_PATH.open(encoding="utf-8") as handle:
        return [_from_dict(item) for item in json.load(handle)]


def load_test_log() -> tuple[str, list[TrainingExample]]:
    """Read the committed ``test_log.json`` as ``(mission_log, examples)``."""
    with TEST_LOG_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload["mission_log"], [_from_dict(item) for item in payload["examples"]]


def write_data_files(
    corpus_seed: int = 42,
    examples_per_intent: int = 30,
    test_log_seed: int = 123,
) -> tuple[list[TrainingExample], str, list[TrainingExample]]:
    """Regenerate and overwrite both committed JSON files."""
    corpus = generate_corpus(seed=corpus_seed, examples_per_intent=examples_per_intent)
    mission_log, test_examples = generate_test_log(seed=test_log_seed)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BASE_CORPUS_PATH.write_text(dumps_corpus(corpus), encoding="utf-8")
    TEST_LOG_PATH.write_text(
        dumps_test_log(mission_log, test_examples), encoding="utf-8"
    )
    return corpus, mission_log, test_examples


def _amount_set(examples: Iterable[TrainingExample]) -> list[int]:
    return sorted({int(e.amount_cm) for e in examples if e.amount_cm is not None})


def main() -> None:
    """Regenerate the committed JSON files and print a reviewable summary.

    Run from ``backend/`` with the venv active::

        python -m app.services.corpus
    """
    corpus, mission_log, test_examples = write_data_files()

    print(f"wrote {BASE_CORPUS_PATH} ({len(corpus)} examples)")
    print(f"wrote {TEST_LOG_PATH} ({len(test_examples)} examples)")
    print()
    print("per-intent counts:")
    for intent in INTENTS:
        count = sum(1 for e in corpus if e.intent == intent)
        print(f"  {intent:<11} {count}")
    print(f"  {'TOTAL':<11} {len(corpus)}")
    print(f"  unique sentences: {len({e.sentence for e in corpus})}/{len(corpus)}")
    print()
    corpus_amounts = _amount_set(corpus)
    log_amounts = _amount_set(test_examples)
    print(f"corpus amounts   ({len(corpus_amounts):>3}): {corpus_amounts}")
    print(f"test-log amounts ({len(log_amounts):>3}): {log_amounts}")
    print(f"amount overlap: {sorted(set(corpus_amounts) & set(log_amounts))}")
    print()
    print("mission log:")
    print(f"  {mission_log}")


if __name__ == "__main__":
    main()
