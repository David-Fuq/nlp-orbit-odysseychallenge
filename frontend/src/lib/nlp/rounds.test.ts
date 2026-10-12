import { describe, expect, it } from "vitest";
import type { Prediction, TrainingExample } from "./api";
import { exampleCommand } from "./grading";
import {
  alignedPredictions,
  buildFinalTestResult,
  canStartTraining,
  countCorrect,
  datasetKey,
  recordRoundResult,
} from "./rounds";
import { FINAL_TEST_LOG, PRACTICE_LOGS, type TestLog } from "./testLogs";

function predictionsFor(log: TestLog): Prediction[] {
  return log.examples.map((e) => ({ ...e, command: exampleCommand(e) }));
}

const DATASET: TrainingExample[] = [
  { sentence: "roll forward 40 cm", intent: "STRAIGHT", amount_cm: 40 },
  { sentence: "now turn left", intent: "TURN_LEFT", amount_cm: null },
  { sentence: "do a 180", intent: "TURN_180", amount_cm: null },
];

describe("datasetKey", () => {
  it("ignores order, case and outer whitespace", () => {
    const shuffled = [DATASET[2], { ...DATASET[0], sentence: "  Roll Forward 40 cm " }, DATASET[1]];
    expect(datasetKey(shuffled)).toBe(datasetKey(DATASET));
  });

  it("changes when a row is added", () => {
    const added = [...DATASET, { sentence: "back up 20 cm", intent: "BACKWARDS" as const, amount_cm: 20 }];
    expect(datasetKey(added)).not.toBe(datasetKey(DATASET));
  });

  it("changes when a row is removed", () => {
    expect(datasetKey(DATASET.slice(1))).not.toBe(datasetKey(DATASET));
    expect(datasetKey([])).not.toBe(datasetKey(DATASET));
  });

  it("changes when a row is edited (sentence, intent or amount)", () => {
    const edits: TrainingExample[] = [
      { ...DATASET[0], sentence: "roll forward 40 centimeters" },
      { ...DATASET[0], intent: "BACKWARDS" },
      { ...DATASET[0], amount_cm: 41 },
    ];
    for (const edit of edits) {
      expect(datasetKey([edit, DATASET[1], DATASET[2]])).not.toBe(datasetKey(DATASET));
    }
  });
});

describe("recordRoundResult", () => {
  it("sets first and latest on a log's first run", () => {
    expect(recordRoundResult([], "practice-1", 3, 7)).toEqual([
      { log_id: "practice-1", first_correct: 3, latest_correct: 3, total: 7 },
    ]);
  });

  it("updates only latest on a re-run", () => {
    const once = recordRoundResult([], "practice-1", 3, 7);
    expect(recordRoundResult(once, "practice-1", 5, 7)).toEqual([
      { log_id: "practice-1", first_correct: 3, latest_correct: 5, total: 7 },
    ]);
  });

  it("leaves other logs alone", () => {
    const history = recordRoundResult(recordRoundResult([], "practice-1", 3, 7), "practice-2", 2, 6);
    const next = recordRoundResult(history, "practice-2", 4, 6);
    expect(next[0]).toEqual(history[0]);
    expect(next.map((r) => r.log_id)).toEqual(["practice-1", "practice-2"]);
  });
});

describe("alignedPredictions and countCorrect", () => {
  it("counts per-sentence correct predictions", () => {
    const log = PRACTICE_LOGS[0];
    const predictions = predictionsFor(log);
    expect(countCorrect(log, predictions)).toBe(log.examples.length);
    predictions[1] = { ...predictions[1], intent: "TURN_180", amount_cm: null, command: "TURN 180" };
    expect(countCorrect(log, predictions)).toBe(log.examples.length - 1);
  });

  it("rejects misaligned predictions", () => {
    const log = PRACTICE_LOGS[0];
    expect(alignedPredictions(log, predictionsFor(log))).not.toBeNull();
    expect(alignedPredictions(log, predictionsFor(log).slice(1))).toBeNull();
    expect(alignedPredictions(log, predictionsFor(PRACTICE_LOGS[1]))).toBeNull();
    expect(alignedPredictions(log, predictionsFor(log).reverse())).toBeNull();
  });
});

describe("buildFinalTestResult", () => {
  const now = new Date("2026-10-12T10:00:00.000Z");

  it("builds a result from a complete aligned predict", () => {
    const predictions = predictionsFor(FINAL_TEST_LOG);
    predictions[3] = { ...predictions[3], intent: "TURN_LEFT", command: "TURN LEFT" };
    expect(buildFinalTestResult(predictions, 27, now)).toEqual({
      predictions,
      correct: FINAL_TEST_LOG.examples.length - 1,
      total: FINAL_TEST_LOG.examples.length,
      taken_at: "2026-10-12T10:00:00.000Z",
      examples_count: 27,
    });
  });

  it("returns null for a partial or misaligned predict", () => {
    expect(buildFinalTestResult([], 27, now)).toBeNull();
    expect(buildFinalTestResult(predictionsFor(FINAL_TEST_LOG).slice(0, -1), 27, now)).toBeNull();
    expect(buildFinalTestResult(predictionsFor(PRACTICE_LOGS[0]), 27, now)).toBeNull();
  });
});

describe("canStartTraining", () => {
  const ok = { busy: false, jobId: "job", missingIntents: [], finalTest: null };

  it("refuses once the final test is taken", () => {
    expect(canStartTraining(ok)).toBe(true);
    const finalTest = buildFinalTestResult(predictionsFor(FINAL_TEST_LOG), 15, new Date());
    expect(canStartTraining({ ...ok, finalTest })).toBe(false);
  });

  it("refuses while busy, without a job id or with missing intents", () => {
    expect(canStartTraining({ ...ok, busy: true })).toBe(false);
    expect(canStartTraining({ ...ok, jobId: "" })).toBe(false);
    expect(canStartTraining({ ...ok, missingIntents: ["TURN_180"] })).toBe(false);
  });
});
