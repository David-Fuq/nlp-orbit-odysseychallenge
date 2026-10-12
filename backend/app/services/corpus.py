"""
app.services.corpus
-------------------
Template-based generator for the labeled training corpus and the test-log
bank: five practice mission logs plus the final-test log (PR-12).

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
from typing import Any, Iterable, Literal, Optional, Sequence, TypedDict

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

#: The final-test log draws its amounts from this pool. It is the original
#: reserved tuple, kept in the same order, so ``generate_test_log`` samples
#: exactly what it always did and the final log stays byte-identical.
FINAL_TEST_AMOUNTS: tuple[int, ...] = (7, 26, 38, 64, 81, 97, 118, 143)

#: The practice logs' pool. Disjoint from the final pool, and also clear of
#: Step 2's candidate amounts (12, 18, 25, 70) and of 90, which the turn
#: templates use as an angle. The practice logs deal from one deck, so every
#: amount appears at most once across the whole bank; two values are spare.
PRACTICE_TEST_AMOUNTS: tuple[int, ...] = (
    9, 13, 22, 29, 33, 44, 49, 56, 61, 69,
    74, 78, 88, 94, 103, 109, 121, 126, 134, 147,
)

#: Amounts held back from the corpus so the test logs are a *generalization*
#: test rather than a memorization check. Excluding them from the corpus pool
#: makes the no-overlap guarantee structural: it holds for every corpus seed
#: and every ``examples_per_intent``, not just the seeded defaults.
RESERVED_TEST_AMOUNTS: tuple[int, ...] = tuple(
    sorted(FINAL_TEST_AMOUNTS + PRACTICE_TEST_AMOUNTS)
)

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
# Astronaut-voice narrative, the same register as the Step 1 mission log.
#
# Two deliberate shape rules:
#   1. One command per sentence, so every sentence has exactly one
#      ground-truth command. A sentence carrying two commands would make
#      per-sentence grading ill-defined.
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
# Practice mission logs (PR-12)
#
# Five more arcs for Step 5's practice rounds, with the same shape rules as
# TEST_LOG_SLOTS: one command per sentence, every sentence normalises to its
# ground truth by ``normalize_sentence``, at most one numeral per sentence.
# Each arc covers all five intents in 6-7 slots, with 2+ phrasings per slot.
#
# Students add practice sentences to their own training data, so these
# phrasings must not leak into the final log, and must not come from TEMPLATES
# either, or a practice round would test memorization. tests/test_corpus.py
# enforces both: no practice phrasing shares a three-word sequence (numerals
# as <num>) with any TEST_LOG_SLOTS variant or any TEMPLATES x GARNISH form.
# The turn vocabulary is deliberately new (port, starboard, anticlockwise,
# about-face, end for end) so every round meets unfamiliar wording.
# --------------------------------------------------------------------------

PRACTICE_LOG_ARCS: tuple[tuple[tuple[Intent, tuple[str, ...]], ...], ...] = (
    # practice-1: out of the hangar and back.
    (
        (
            "STRAIGHT",
            (
                "Leave the hangar bay and coast {cm} centimeters onto the open flats.",
                "Clear the hangar doors by driving {cm} centimeters forward.",
            ),
        ),
        (
            "TURN_LEFT",
            (
                "Hook left around the antenna mast.",
                "Rotate a quarter turn counterclockwise so the crater wall fills the windshield.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Trundle {cm} centimeters farther until the first sampling flag is beside you.",
                "Keep going {cm} centimeters past the cable spool.",
            ),
        ),
        (
            "BACKWARDS",
            (
                "Throw it in reverse and cover {cm} centimeters while the drill retracts.",
                "Shuffle backward {cm} centimeters while the scoop drops.",
            ),
        ),
        (
            "TURN_RIGHT",
            (
                "Rotate a quarter turn clockwise toward the seismometer.",
                "Angle off to starboard to point at the seismometer.",
            ),
        ),
        (
            "TURN_180",
            (
                "Wheel round completely so the headlights face the hangar again.",
                "Reverse course so the rear bumper points at the ridge.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Wrap up by cruising {cm} centimeters back into the hangar.",
                "End the loop with a {cm} centimeter roll into the hangar.",
            ),
        ),
    ),
    # practice-2: sheltering from a dust storm.
    (
        (
            "TURN_RIGHT",
            (
                "Cut hard right at the shelter rocks.",
                "Steer starboard toward the shelter rocks.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Dash {cm} centimeters ahead before visibility drops.",
                "Charge forward {cm} centimeters while you can still see the rocks.",
            ),
        ),
        (
            "TURN_LEFT",
            (
                "Tuck in to port behind the tallest rock.",
                "Bank left and shelter the solar wings behind the boulder.",
            ),
        ),
        (
            "BACKWARDS",
            (
                "Inch rearward {cm} centimeters into the windbreak.",
                "Tuck yourself in by backing {cm} centimeters under the ledge.",
            ),
        ),
        (
            "TURN_180",
            (
                "Turn tail so the storm blows against your back panel.",
                "Face the opposite direction and let the storm pass behind you.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Once it clears roll {cm} centimeters out into the open.",
                "When the air clears creep {cm} centimeters beyond the rocks.",
            ),
        ),
    ),
    # practice-3: probing the ice.
    (
        (
            "STRAIGHT",
            (
                "Slide forward {cm} centimeters over the frozen crust.",
                "Proceed {cm} centimeters over the ice sheet.",
            ),
        ),
        (
            "TURN_LEFT",
            (
                "Make a 90 degree turn to port toward the vent.",
                "Peel off leftward toward the steam vent.",
            ),
        ),
        (
            "BACKWARDS",
            (
                "Give ground {cm} centimeters because the ice is cracking.",
                "Back off {cm} centimeters now that the ice is groaning.",
            ),
        ),
        (
            "TURN_RIGHT",
            (
                "Swivel rightward until the drill is aimed at the vent.",
                "Make a 90 degree turn to starboard.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Crawl onward {cm} centimeters then plant the probe.",
                "Advance carefully {cm} centimeters with the probe lowered.",
            ),
        ),
        (
            "TURN_180",
            (
                "Do a complete reversal and retrace your route across the ice.",
                "Pirouette fully around and face the lander.",
            ),
        ),
        (
            "BACKWARDS",
            (
                "Withdraw {cm} centimeters as the probe takes its reading.",
                "Finish by easing {cm} centimeters in reverse.",
            ),
        ),
    ),
    # practice-4: docking at the relay station.
    (
        (
            "TURN_LEFT",
            (
                "Swerve left to meet the relay station head on.",
                "Wheel to port and square the rover with the mast.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Shrink the gap by {cm} centimeters.",
                "Head straight in {cm} centimeters right against the docking port.",
            ),
        ),
        (
            "TURN_180",
            (
                "About-face so the cargo hatch opens toward the station.",
                "Present your back hatch to the station by spinning completely around.",
            ),
        ),
        (
            "BACKWARDS",
            (
                "Back the hatch in {cm} centimeters against the station.",
                "Creep in reverse {cm} centimeters till the loading arm touches the hatch.",
            ),
        ),
        (
            "TURN_RIGHT",
            (
                "Swing out to starboard once the transfer is done.",
                "Veer clockwise and leave the station behind.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Depart {cm} centimeters down the service road.",
                "Pull forward {cm} centimeters clear of the station.",
            ),
        ),
    ),
    # practice-5: a canyon run.
    (
        (
            "TURN_RIGHT",
            (
                "Face starboard and look down into the canyon.",
                "Twist clockwise until the canyon mouth is in view.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Descend the slope {cm} centimeters on low gear.",
                "Edge forward {cm} centimeters on the gravel slope.",
            ),
        ),
        (
            "TURN_LEFT",
            (
                "Cut left along the canyon floor.",
                "Rotate anticlockwise to trace the canyon wall.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Sprint {cm} centimeters between the canyon walls.",
                "Hustle forward {cm} centimeters beneath the arch.",
            ),
        ),
        (
            "TURN_180",
            (
                "Dead end so turn the rover end for end.",
                "Hit the dead end and pivot to face where you started.",
            ),
        ),
        (
            "BACKWARDS",
            (
                "Reverse clear of the dead end by {cm} centimeters.",
                "Retreat slowly {cm} centimeters with the walls closing in.",
            ),
        ),
        (
            "STRAIGHT",
            (
                "Gun it the last {cm} centimeters.",
                "Make the final {cm} centimeter dash toward the exit.",
            ),
        ),
    ),
)

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parent / "data"
BASE_CORPUS_PATH = DATA_DIR / "base_corpus.json"
TEST_LOGS_PATH = DATA_DIR / "test_logs.json"


@dataclass
class TestLog:
    """One mission log of the test-log bank: prose plus per-sentence labels.

    ``examples`` carries one ``TrainingExample`` per sentence of
    ``mission_log``, in order. ``id`` is ``practice-1`` ... ``practice-5`` or
    ``final`` (README, "Test-log bank file").
    """

    __test__ = False  # not a pytest test class, despite the name

    id: str
    mission_log: str
    examples: list[TrainingExample]


class LogBank(TypedDict):
    """The whole test-log bank, shaped like ``test_logs.json``."""

    practice: list[TestLog]
    final: TestLog


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


def _numeric_slot_count(slots: Iterable[tuple[Intent, tuple[str, ...]]]) -> int:
    return sum(1 for intent, _ in slots if intent in NUMERIC_INTENTS)


def _render_log(
    rng: random.Random,
    slots: Sequence[tuple[Intent, tuple[str, ...]]],
    amounts: list[int],
) -> tuple[str, list[TrainingExample]]:
    """Pick one phrasing per slot and fill distance slots from *amounts*.

    Consumes *amounts* from the front, one per distance slot, so a caller can
    deal a single deck across several logs.
    """
    sentences: list[str] = []
    examples: list[TrainingExample] = []
    for intent, variants in slots:
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


def generate_test_log(seed: int = 123) -> tuple[str, list[TrainingExample]]:
    """Generate the final-test mission log and its ground-truth labels.

    Returns ``(mission_log, examples)`` where *mission_log* is one narrative
    astronaut-voice paragraph and *examples* carries one ``TrainingExample``
    per sentence in it, in order. This is the held-out set Steps 5 and 6 use
    today (PR-09/10) and the bank's ``final`` log (PR-12).

    It does not overlap ``generate_corpus()`` by construction, not by luck:
    its amounts come from ``FINAL_TEST_AMOUNTS``, part of the reserved set the
    corpus pool excludes, and its phrasings are a separate table from
    ``TEMPLATES``. The rng draws (sample, then one choice per slot) are in the
    same order as before PR-12, which is what keeps the output unchanged.
    """
    rng = random.Random(seed)
    amounts = rng.sample(FINAL_TEST_AMOUNTS, k=_numeric_slot_count(TEST_LOG_SLOTS))
    return _render_log(rng, TEST_LOG_SLOTS, amounts)


def generate_practice_logs(seed: int = 123) -> list[TestLog]:
    """Generate the five practice logs, ``practice-1`` ... ``practice-5``.

    Uses its own ``random.Random``, seeded apart from the final log's, so
    editing the practice tables can never change the final log. Amounts are
    dealt from one shuffled deck of ``PRACTICE_TEST_AMOUNTS``, so none repeats
    anywhere in the bank.
    """
    rng = random.Random(f"{seed}-practice")
    needed = sum(_numeric_slot_count(arc) for arc in PRACTICE_LOG_ARCS)
    deck = rng.sample(PRACTICE_TEST_AMOUNTS, k=needed)
    logs: list[TestLog] = []
    for number, arc in enumerate(PRACTICE_LOG_ARCS, start=1):
        mission_log, examples = _render_log(rng, arc, deck)
        logs.append(TestLog(f"practice-{number}", mission_log, examples))
    return logs


def generate_test_logs(seed: int = 123) -> LogBank:
    """Generate the whole test-log bank: ``{"practice": [...], "final": ...}``.

    ``practice`` is a list of five ``TestLog``; ``final`` is the
    ``generate_test_log`` output wrapped as a ``TestLog`` with id ``final``.
    """
    mission_log, examples = generate_test_log(seed)
    return {
        "practice": generate_practice_logs(seed),
        "final": TestLog("final", mission_log, examples),
    }


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


def _dumps_test_log_object(log: TestLog, indent: str) -> str:
    """One ``{"id", "mission_log", "examples"}`` object, examples one per line.

    *indent* is the indentation of the object's fields; the closing brace sits
    one level (two spaces) shallower.
    """
    body = _format_example_array(log.examples, indent=indent + "  ")
    return (
        "{\n"
        f'{indent}"id": {json.dumps(log.id)},\n'
        f'{indent}"mission_log": {json.dumps(log.mission_log, ensure_ascii=False)},\n'
        f'{indent}"examples": {body}\n'
        f"{indent[:-2]}}}"
    )


def dumps_test_logs(bank: LogBank) -> str:
    """Serialise the bank as ``{"practice": [...], "final": {...}}``.

    The README's "Test-log bank file" contract, with the same one-example-per-
    line layout the single test log used, so the practice phrasings are easy to
    review in a diff.
    """
    practice = ",\n".join(
        "    " + _dumps_test_log_object(log, indent="      ") for log in bank["practice"]
    )
    final = _dumps_test_log_object(bank["final"], indent="    ")
    return (
        "{\n"
        f'  "practice": [\n{practice}\n  ],\n'
        f'  "final": {final}\n'
        "}\n"
    )


def load_base_corpus() -> list[TrainingExample]:
    """Read the committed ``base_corpus.json``.

    Lets PR-05/PR-07 point at the default seed corpus without re-running the
    generator or hardcoding this directory.
    """
    with BASE_CORPUS_PATH.open(encoding="utf-8") as handle:
        return [_from_dict(item) for item in json.load(handle)]


def _test_log_from_dict(payload: dict[str, Any]) -> TestLog:
    return TestLog(
        id=payload["id"],
        mission_log=payload["mission_log"],
        examples=[_from_dict(item) for item in payload["examples"]],
    )


def load_test_logs() -> LogBank:
    """Read the committed ``test_logs.json`` bank."""
    with TEST_LOGS_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return {
        "practice": [_test_log_from_dict(item) for item in payload["practice"]],
        "final": _test_log_from_dict(payload["final"]),
    }


def load_test_log() -> tuple[str, list[TrainingExample]]:
    """The committed final-test log as ``(mission_log, examples)``.

    Kept from before PR-12, when the final log was the only test log, so
    existing callers don't change.
    """
    final = load_test_logs()["final"]
    return final.mission_log, final.examples


def write_data_files(
    corpus_seed: int = 42,
    examples_per_intent: int = 30,
    test_log_seed: int = 123,
) -> tuple[list[TrainingExample], LogBank]:
    """Regenerate and overwrite both committed JSON files."""
    corpus = generate_corpus(seed=corpus_seed, examples_per_intent=examples_per_intent)
    bank = generate_test_logs(seed=test_log_seed)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BASE_CORPUS_PATH.write_text(dumps_corpus(corpus), encoding="utf-8")
    TEST_LOGS_PATH.write_text(dumps_test_logs(bank), encoding="utf-8")
    return corpus, bank


def _amount_set(examples: Iterable[TrainingExample]) -> list[int]:
    return sorted({int(e.amount_cm) for e in examples if e.amount_cm is not None})


def main() -> None:
    """Regenerate the committed JSON files and print a reviewable summary.

    Run from ``backend/`` with the venv active::

        python -m app.services.corpus
    """
    corpus, bank = write_data_files()
    logs = [*bank["practice"], bank["final"]]

    print(f"wrote {BASE_CORPUS_PATH} ({len(corpus)} examples)")
    print(f"wrote {TEST_LOGS_PATH} ({len(logs)} logs)")
    print()
    print("per-intent counts:")
    for intent in INTENTS:
        count = sum(1 for e in corpus if e.intent == intent)
        print(f"  {intent:<11} {count}")
    print(f"  {'TOTAL':<11} {len(corpus)}")
    print(f"  unique sentences: {len({e.sentence for e in corpus})}/{len(corpus)}")
    print()
    corpus_amounts = _amount_set(corpus)
    log_amounts = _amount_set(e for log in logs for e in log.examples)
    print(f"corpus amounts   ({len(corpus_amounts):>3}): {corpus_amounts}")
    print(f"test-log amounts ({len(log_amounts):>3}): {log_amounts}")
    print(f"amount overlap: {sorted(set(corpus_amounts) & set(log_amounts))}")
    for log in logs:
        print()
        print(f"{log.id}:")
        print(f"  {log.mission_log}")
        for example in log.examples:
            command = example.intent.replace("_", " ")
            if example.amount_cm is not None:
                command = f"{command} {int(example.amount_cm)}"
            print(f"    {command:<14} {example.sentence}")


if __name__ == "__main__":
    main()
