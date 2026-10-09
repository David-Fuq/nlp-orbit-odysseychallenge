// Step 5's grading rules, kept pure so they're unit-tested and Step 6 (PR-10)
// can reuse the same bands.
//
// Two separate grades:
// - Per sentence (isPredictionCorrect): did the model understand this one
//   sentence? The intent must match exactly. For STRAIGHT/BACKWARDS the amount
//   must also be within AMOUNT_TOLERANCE_CM, because the model answers in whole
//   centimeters, so demanding exact equality would mark near-misses as wrong.
// - Whole path (comparePaths + DistanceResult with HELD_OUT_PATH_BANDS): where
//   does the robot end up after running every predicted command?

import type { Prediction, TrainingExample } from "./api";
import { INTENT_LABELS, intentTakesAmount, sameSentence } from "./intents";

/** Largest amount miss, in cm, that still counts as correct. */
export const AMOUNT_TOLERANCE_CM = 5;

/**
 * Centimeter-scale bands for DistanceResult on the held-out log. Under 5 cm is
 * a rounding-level miss; under 20 cm means the right structure with one
 * amount a little off; beyond that the path really diverged.
 *
 * Consistent with AMOUNT_TOLERANCE_CM: a run with every sentence correct ends
 * at most sqrt(200) ≈ 14.1 cm away on this log, so it is never a warning
 * (grading.test.ts checks this). A single wrong turn, or one amount off by
 * more than 20 cm, is.
 */
export const HELD_OUT_PATH_BANDS = { success: 5, info: 20 } as const;

export function isPredictionCorrect(
  truth: TrainingExample,
  prediction: Pick<Prediction, "intent" | "amount_cm">,
): boolean {
  if (prediction.intent !== truth.intent) return false;
  if (!intentTakesAmount(truth.intent)) return true;
  if (prediction.amount_cm === null || truth.amount_cm === null) return false;
  return Math.abs(prediction.amount_cm - truth.amount_cm) <= AMOUNT_TOLERANCE_CM;
}

/** The robot command a labeled example stands for, e.g. "STRAIGHT 40" or "TURN LEFT". */
export function exampleCommand(example: TrainingExample): string {
  const word = INTENT_LABELS[example.intent];
  return intentTakesAmount(example.intent) ? `${word} ${example.amount_cm}` : word;
}

function sameLabel(a: TrainingExample, b: TrainingExample): boolean {
  return a.intent === b.intent && a.amount_cm === b.amount_cm;
}

export type TeachResult =
  | { kind: "added"; next: TrainingExample[] }
  | { kind: "already"; next: readonly TrainingExample[] }
  | { kind: "relabeled"; next: TrainingExample[]; previous: TrainingExample };

/**
 * "Teach it this one": adds the ground-truth example to the dataset.
 * - Sentence not in the dataset: appended.
 * - Already there with the same label: nothing changes.
 * - Already there with a different label: that row is replaced in place (any
 *   further copies are dropped). The ground truth wins, because keeping both
 *   would train the model on two contradictory labels for one sentence.
 * Sentences match by `sameSentence` (case and outer whitespace ignored).
 */
export function planTeach(examples: readonly TrainingExample[], truth: TrainingExample): TeachResult {
  const matches = examples.filter((e) => sameSentence(e.sentence, truth.sentence));
  if (matches.length === 0) return { kind: "added", next: [...examples, { ...truth }] };
  if (matches.every((e) => sameLabel(e, truth))) return { kind: "already", next: examples };

  const previous = matches.find((e) => !sameLabel(e, truth)) ?? matches[0];
  const next: TrainingExample[] = [];
  let placed = false;
  for (const e of examples) {
    if (!sameSentence(e.sentence, truth.sentence)) {
      next.push(e);
    } else if (!placed) {
      next.push({ ...truth });
      placed = true;
    }
  }
  return { kind: "relabeled", next, previous };
}
