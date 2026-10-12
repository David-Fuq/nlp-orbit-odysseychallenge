// Starter examples seeded into every student's dataset so Step 3 isn't empty
// on first visit. A trimmed copy (3 per intent, copied verbatim, not linked)
// of backend/app/services/data/base_corpus.json, which PR-03 generates;
// baseExamples.test.ts fails if a row is no longer in that file. Kept small on
// purpose: the student's own labels in Step 2 should matter.

import type { TrainingExample } from "./api";

export const BASE_EXAMPLES: readonly TrainingExample[] = [
  { sentence: "from here roll forward 60 cm and hold position", intent: "STRAIGHT", amount_cm: 60 },
  { sentence: "advance 106 centimeters toward the ridge before you continue", intent: "STRAIGHT", amount_cm: 106 },
  {
    sentence: "drive straight 83 centimeters until the terrain levels out before you continue",
    intent: "STRAIGHT",
    amount_cm: 83,
  },
  { sentence: "then back up 36 centimeters before you continue", intent: "BACKWARDS", amount_cm: 36 },
  {
    sentence: "then reverse 114 cm away from the crater rim and wait for the go-ahead",
    intent: "BACKWARDS",
    amount_cm: 114,
  },
  { sentence: "then retreat 102 cm to clear the lander leg before you continue", intent: "BACKWARDS", amount_cm: 102 },
  { sentence: "then pivot right toward the comms tower and hold position", intent: "TURN_RIGHT", amount_cm: null },
  { sentence: "next rotate clockwise before you continue", intent: "TURN_RIGHT", amount_cm: null },
  // A turn with a numeral: the 90 is an angle, not a distance.
  { sentence: "now yaw right 90 degrees before you continue", intent: "TURN_RIGHT", amount_cm: null },
  { sentence: "now turn left", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "rotate counter-clockwise and wait for the go-ahead", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "now pivot left toward the relay dish before you continue", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "now do a 180 and hold position", intent: "TURN_180", amount_cm: null },
  { sentence: "from here turn all the way around and wait for the go-ahead", intent: "TURN_180", amount_cm: null },
  { sentence: "then spin around to face the other way before you continue", intent: "TURN_180", amount_cm: null },
];

/**
 * Whether `example` is an unmodified starter example. Derived rather than
 * stored as a flag, so `labeled_examples` stays a plain TrainingExample[] (the
 * /api/train wire shape). Editing a starter row makes it the student's own.
 */
export function isStarterExample(example: TrainingExample): boolean {
  return BASE_EXAMPLES.some(
    (b) =>
      b.sentence === example.sentence &&
      b.intent === example.intent &&
      b.amount_cm === example.amount_cm,
  );
}
