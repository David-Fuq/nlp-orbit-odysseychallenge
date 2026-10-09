// The held-out test mission log for Step 5 (and Step 6's comparison): a
// narrative paragraph plus the ground-truth label of each of its sentences.
// Copied verbatim (not linked) from backend/app/services/data/test_log.json,
// which PR-03 generates; heldOutTestLog.test.ts fails if the two drift apart.
// None of these sentences are in the base corpus, so they test generalization.

import type { TrainingExample } from "./api";
import { exampleCommand } from "./grading";

export const HELD_OUT_MISSION_LOG =
  "Ease down off the ramp and hold a straight line for 7 centimeters. Pivot to the right so the solar panel catches the sunrise. Creep straight ahead another 38 centimeters to line up with the drill hole. Swap ends so the camera mast faces back down the trail. Give yourself 143 centimeters of room by backing off the rim. Haul around to the left and hold there until the telemetry catches up. Finish the run with 64 centimeters straight ahead to the charging pad.";

/** One per sentence of HELD_OUT_MISSION_LOG, in order. These are what /api/predict receives. */
export const HELD_OUT_EXAMPLES: readonly TrainingExample[] = [
  { sentence: "ease down off the ramp and hold a straight line for 7 centimeters", intent: "STRAIGHT", amount_cm: 7 },
  { sentence: "pivot to the right so the solar panel catches the sunrise", intent: "TURN_RIGHT", amount_cm: null },
  {
    sentence: "creep straight ahead another 38 centimeters to line up with the drill hole",
    intent: "STRAIGHT",
    amount_cm: 38,
  },
  { sentence: "swap ends so the camera mast faces back down the trail", intent: "TURN_180", amount_cm: null },
  { sentence: "give yourself 143 centimeters of room by backing off the rim", intent: "BACKWARDS", amount_cm: 143 },
  {
    sentence: "haul around to the left and hold there until the telemetry catches up",
    intent: "TURN_LEFT",
    amount_cm: null,
  },
  { sentence: "finish the run with 64 centimeters straight ahead to the charging pad", intent: "STRAIGHT", amount_cm: 64 },
];

/**
 * The ground-truth robot commands for HELD_OUT_MISSION_LOG, one per line.
 * Step 5 and Step 6 both grade against this, so there is one copy.
 */
export const HELD_OUT_REFERENCE_COMMANDS = HELD_OUT_EXAMPLES.map(exampleCommand).join("\n");
