// The test-log bank: five practice logs for Step 5's practice rounds and the
// final-test log, which students see only when they take the final test.
// testLogs.json is copied verbatim (not linked) from
// backend/app/services/data/test_logs.json, which PR-12's generator writes;
// testLogs.test.ts fails if the two drift apart. None of these sentences are
// in the base corpus, so they test generalization.

import type { TrainingExample } from "./api";
import { exampleCommand } from "./grading";
import { isTrainingExample } from "./intents";
import bank from "./testLogs.json";

export type TestLog = {
  id: string;
  mission_log: string;
  /** One per sentence of `mission_log`, in order. These are what /api/predict receives. */
  examples: readonly TrainingExample[];
};

// Validated at import time, so a bad hand edit of the JSON fails loudly in
// tests instead of reaching a student as a broken round.
function toTestLog(raw: unknown, where: string): TestLog {
  if (typeof raw !== "object" || raw === null) throw new Error(`testLogs.json: ${where} is not an object`);
  const { id, mission_log, examples } = raw as Record<string, unknown>;
  if (typeof id !== "string" || id === "") throw new Error(`testLogs.json: ${where} has no id`);
  if (typeof mission_log !== "string" || mission_log.trim() === "") {
    throw new Error(`testLogs.json: ${id} has no mission_log`);
  }
  if (!Array.isArray(examples) || examples.length === 0) throw new Error(`testLogs.json: ${id} has no examples`);
  const bad = examples.findIndex((e) => !isTrainingExample(e));
  if (bad !== -1) throw new Error(`testLogs.json: ${id} example ${bad} is not a valid TrainingExample`);
  return { id, mission_log, examples: examples as TrainingExample[] };
}

export const PRACTICE_LOGS: readonly TestLog[] = bank.practice.map((log, i) => toTestLog(log, `practice[${i}]`));

export const FINAL_TEST_LOG: TestLog = toTestLog(bank.final, "final");

/** The ground-truth robot commands for `log`, one per line. */
export function referenceCommands(log: TestLog): string {
  return log.examples.map(exampleCommand).join("\n");
}
