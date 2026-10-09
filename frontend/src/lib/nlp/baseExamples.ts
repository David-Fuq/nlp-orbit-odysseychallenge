// Starter examples seeded into every student's dataset so Step 3 isn't empty
// on first visit. A trimmed copy (3 per intent, copied verbatim, not linked)
// of backend/app/services/data/base_corpus.json, which PR-03 generates. Kept
// small on purpose: the student's own labels in Step 2 should matter.

import type { TrainingExample } from "./api";

export const BASE_EXAMPLES: readonly TrainingExample[] = [
  { sentence: "roll forward 52 cm and wait for the go-ahead", intent: "STRAIGHT", amount_cm: 52 },
  { sentence: "now advance 65 centimeters toward the ridge", intent: "STRAIGHT", amount_cm: 65 },
  {
    sentence: "then drive straight 83 centimeters until the terrain levels out and hold position",
    intent: "STRAIGHT",
    amount_cm: 83,
  },
  { sentence: "next back up 40 centimeters and wait for the go-ahead", intent: "BACKWARDS", amount_cm: 40 },
  { sentence: "reverse 144 cm away from the crater rim and wait for the go-ahead", intent: "BACKWARDS", amount_cm: 144 },
  { sentence: "now retreat 53 cm to clear the lander leg and hold position", intent: "BACKWARDS", amount_cm: 53 },
  { sentence: "next pivot right toward the comms tower", intent: "TURN_RIGHT", amount_cm: null },
  { sentence: "next rotate clockwise before you continue", intent: "TURN_RIGHT", amount_cm: null },
  // A turn with a numeral: the 90 is an angle, not a distance.
  { sentence: "now yaw right 90 degrees", intent: "TURN_RIGHT", amount_cm: null },
  { sentence: "turn left before you continue", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "rotate counter-clockwise", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "then pivot left toward the relay dish before you continue", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "then do a 180 before you continue", intent: "TURN_180", amount_cm: null },
  { sentence: "then turn all the way around before you continue", intent: "TURN_180", amount_cm: null },
  { sentence: "from here spin around to face the other way", intent: "TURN_180", amount_cm: null },
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
