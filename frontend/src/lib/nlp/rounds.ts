// Step 5's practice rounds and final test, kept pure so they're unit-tested
// and restoreMissionState can validate stored results with the same rules.

import type { FinalTestResult, RoundResult } from "@/state/missionStorage";
import type { Prediction, TrainingExample } from "./api";
import { isPredictionCorrect } from "./grading";
import { sameSentence } from "./intents";
import { FINAL_TEST_LOG, type TestLog } from "./testLogs";

/** `predictions` if they line up one-to-one with `log`'s sentences, else null. */
export function alignedPredictions(log: TestLog, predictions: readonly Prediction[]): readonly Prediction[] | null {
  if (predictions.length !== log.examples.length) return null;
  const aligned = predictions.every((p, i) => sameSentence(p.sentence, log.examples[i].sentence));
  return aligned ? predictions : null;
}

/** How many of `predictions` (aligned to `log`) are correct by isPredictionCorrect. */
export function countCorrect(log: TestLog, predictions: readonly Prediction[]): number {
  return log.examples.filter((truth, i) => isPredictionCorrect(truth, predictions[i])).length;
}

/**
 * The history after a successful run of `logId`: a log's first run sets both
 * scores, every later run (e.g. after retraining) only the latest one.
 */
export function recordRoundResult(
  history: readonly RoundResult[],
  logId: string,
  correct: number,
  total: number,
): RoundResult[] {
  if (!history.some((r) => r.log_id === logId)) {
    return [...history, { log_id: logId, first_correct: correct, latest_correct: correct, total }];
  }
  return history.map((r) => (r.log_id === logId ? { ...r, latest_correct: correct } : r));
}

/**
 * The result to save for a final-test predict call, or null unless the
 * response covers every sentence of the final log in order. A partial or
 * misaligned response is never saved: the final test can only be taken once.
 */
export function buildFinalTestResult(
  predictions: readonly Prediction[],
  examplesCount: number,
  now: Date,
): FinalTestResult | null {
  const aligned = alignedPredictions(FINAL_TEST_LOG, predictions);
  if (aligned === null) return null;
  return {
    predictions: aligned.map((p) => ({ ...p })),
    correct: countCorrect(FINAL_TEST_LOG, aligned),
    total: FINAL_TEST_LOG.examples.length,
    taken_at: now.toISOString(),
    examples_count: examplesCount,
  };
}

/**
 * A signature of a dataset's content, so Step 5 can tell whether it changed
 * since the last training run. Any added, removed or edited row (sentence,
 * intent or amount) changes it; row order, letter case and outer whitespace
 * don't, since none of them change what the model learns.
 */
export function datasetKey(examples: readonly TrainingExample[]): string {
  const text = examples
    .map((e) => `${e.sentence.trim().toLowerCase()}\u0000${e.intent}\u0000${e.amount_cm ?? ""}`)
    .sort()
    .join("\n");
  // FNV-1a, 32-bit: cheap and plenty for "did anything change?".
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${examples.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Whether a training run may start. The final test locks training for the
 * session; this check in useTrainingRun.train() is what enforces it, the
 * steps' disabled buttons only reflect it.
 */
export function canStartTraining({
  busy,
  jobId,
  missingIntents,
  finalTest,
}: {
  busy: boolean;
  jobId: string;
  missingIntents: readonly string[];
  finalTest: FinalTestResult | null;
}): boolean {
  return !busy && jobId !== "" && missingIntents.length === 0 && finalTest === null;
}
