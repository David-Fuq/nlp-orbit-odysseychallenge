import { describe, expect, it } from "vitest";
import type { Prediction } from "@/lib/nlp/api";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import { exampleCommand } from "@/lib/nlp/grading";
import { FINAL_TEST_LOG, PRACTICE_LOGS, type TestLog } from "@/lib/nlp/testLogs";
import { DEFAULTS, isUuid, restoreMissionState, type FinalTestResult } from "./missionStorage";

const ID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const NEW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const newId = () => NEW_ID;

/** All-correct predictions for `log`, in order. */
function predictionsFor(log: TestLog): Prediction[] {
  return log.examples.map((e) => ({ ...e, command: exampleCommand(e) }));
}

/** A final test with the first sentence wrong. */
function validFinalTest(): FinalTestResult {
  const predictions = predictionsFor(FINAL_TEST_LOG);
  predictions[0] = { ...predictions[0], intent: "BACKWARDS", command: `BACKWARDS ${predictions[0].amount_cm}` };
  return {
    predictions,
    correct: FINAL_TEST_LOG.examples.length - 1,
    total: FINAL_TEST_LOG.examples.length,
    taken_at: "2026-10-12T10:00:00.000Z",
    examples_count: 27,
  };
}

describe("restoreMissionState", () => {
  it("upgrades a pre-PR-07 blob: new job_id, seeded examples, removed fields dropped", () => {
    const oldBlob = {
      mission_log_1: "my log",
      actions_list: "cruise, forward",
      amounts_list: "two",
      landmarks_list: "crater",
      student_commands_1: "STRAIGHT 40",
      move_synonyms: "go",
      turn_synonyms: "turn",
      left_synonyms: "left",
      right_synonyms: "right",
      student_dict_notes: "notes",
      student_new_commands: "",
      llm_commands_new: "",
    };
    const { state, generated } = restoreMissionState(oldBlob, DEFAULTS, newId);
    expect(generated).toBe(true);
    expect(state.job_id).toBe(NEW_ID);
    expect(state.labeled_examples).toEqual(BASE_EXAMPLES);
    expect(state.mission_log_1).toBe("my log");
    expect(state).not.toHaveProperty("actions_list");
    expect(state).not.toHaveProperty("amounts_list");
    expect(state).not.toHaveProperty("landmarks_list");
    expect(state).not.toHaveProperty("student_dict_notes");
    // Rule-based synonym lists, removed with the old Step 5 in PR-09.
    expect(state).not.toHaveProperty("move_synonyms");
    expect(state).not.toHaveProperty("turn_synonyms");
    expect(state).not.toHaveProperty("left_synonyms");
    expect(state).not.toHaveProperty("right_synonyms");
    // Old-log Step 6 fields, removed in PR-10.
    expect(state).not.toHaveProperty("student_new_commands");
    expect(state).not.toHaveProperty("llm_commands_new");
    // Old Step 1 manual commands, never used by the trained-model flow; removed in PR-11.
    expect(state).not.toHaveProperty("student_commands_1");
  });

  it("gives a pre-PR-08 blob the Step 4 defaults", () => {
    const blob = { job_id: ID, labeled_examples: [], mission_log_1: "my log", move_synonyms: "go" };
    const { state } = restoreMissionState(blob, DEFAULTS, newId);
    expect(state.epochs).toBe(DEFAULTS.epochs);
    expect(state.learning_rate_preset).toBe("balanced");
    expect(state.training_history).toEqual([]);
    expect(state.model_trained).toBe(false);
    expect(state.mission_log_1).toBe("my log");
    expect(state).not.toHaveProperty("move_synonyms");
  });

  it("restores valid Step 4 fields", () => {
    const history = [
      { epoch: 1, intent_loss: 1.6, amount_loss: 0.64, intent_accuracy: 0.2 },
      { epoch: 2, intent_loss: 1.2, amount_loss: 0.1, intent_accuracy: 0.6 },
    ];
    const { state } = restoreMissionState(
      { job_id: ID, epochs: 40, learning_rate_preset: "aggressive", training_history: history, model_trained: true },
      DEFAULTS,
      newId,
    );
    expect(state.epochs).toBe(40);
    expect(state.learning_rate_preset).toBe("aggressive");
    expect(state.training_history).toEqual(history);
    expect(state.training_history).not.toBe(history);
    expect(state.model_trained).toBe(true);
  });

  it("rejects out-of-range or non-integer epochs", () => {
    for (const epochs of [0, 4, 101, 20.5, "20", null]) {
      const { state } = restoreMissionState({ job_id: ID, epochs }, DEFAULTS, newId);
      expect(state.epochs).toBe(DEFAULTS.epochs);
    }
  });

  it("rejects an unknown learning-rate preset", () => {
    for (const learning_rate_preset of ["fast", "", 0.03, null]) {
      const { state } = restoreMissionState({ job_id: ID, learning_rate_preset }, DEFAULTS, newId);
      expect(state.learning_rate_preset).toBe(DEFAULTS.learning_rate_preset);
    }
  });

  it("rejects a non-boolean model_trained", () => {
    for (const model_trained of ["true", 1, null]) {
      const { state } = restoreMissionState({ job_id: ID, model_trained }, DEFAULTS, newId);
      expect(state.model_trained).toBe(false);
    }
  });

  it("drops a training history with any malformed entry", () => {
    const good = { epoch: 1, intent_loss: 1.6, amount_loss: 0.64, intent_accuracy: 0.2 };
    const bads = [
      [good, { epoch: 2, intent_loss: null, amount_loss: 0.1, intent_accuracy: 0.6 }], // NaN serialises as null
      [{ ...good, epoch: 0 }],
      [{ ...good, epoch: 1.5 }],
      [{ intent_loss: 1, amount_loss: 1, intent_accuracy: 1 }],
      "not an array",
    ];
    for (const training_history of bads) {
      const { state } = restoreMissionState({ job_id: ID, training_history }, DEFAULTS, newId);
      expect(state.training_history).toEqual([]);
    }
  });

  it("gives a pre-PR-09 blob no predictions", () => {
    const blob = { job_id: ID, model_trained: true, student_new_commands: "STRAIGHT 60" };
    const { state } = restoreMissionState(blob, DEFAULTS, newId);
    expect(state.round_predictions).toEqual([]);
    expect(state).not.toHaveProperty("student_new_commands");
  });

  it("upgrades a pre-PR-13 blob: practice defaults, predicted_new_commands dropped", () => {
    const blob = {
      job_id: ID,
      labeled_examples: [{ sentence: "creep on 5 cm", intent: "STRAIGHT", amount_cm: 5 }],
      model_trained: true,
      llm_commands_held_out: "STRAIGHT 7",
      predicted_new_commands: predictionsFor(FINAL_TEST_LOG),
    };
    const { state, generated } = restoreMissionState(blob, DEFAULTS, newId);
    expect(generated).toBe(false);
    expect(state).not.toHaveProperty("predicted_new_commands");
    expect(state.practice_round).toBe(0);
    expect(state.round_predictions).toEqual([]);
    expect(state.round_history).toEqual([]);
    expect(state.final_test).toBeNull();
    expect(state.trained_dataset_key).toBeNull();
    expect(state.model_trained).toBe(true);
    expect(state.llm_commands_held_out).toBe("STRAIGHT 7");
  });

  it("restores an in-range practice_round", () => {
    const { state } = restoreMissionState({ job_id: ID, practice_round: 4 }, DEFAULTS, newId);
    expect(state.practice_round).toBe(4);
  });

  it("rejects an out-of-range or non-integer practice_round", () => {
    for (const practice_round of [-1, PRACTICE_LOGS.length, 1.5, "1", null]) {
      const { state } = restoreMissionState({ job_id: ID, practice_round }, DEFAULTS, newId);
      expect(state.practice_round).toBe(0);
    }
  });

  it("restores round predictions aligned with the current practice log", () => {
    const predictions = predictionsFor(PRACTICE_LOGS[1]);
    const { state } = restoreMissionState(
      { job_id: ID, practice_round: 1, round_predictions: predictions },
      DEFAULTS,
      newId,
    );
    expect(state.round_predictions).toEqual(predictions);
    expect(state.round_predictions).not.toBe(predictions);
  });

  it("drops round predictions that are malformed or belong to another log", () => {
    const good = predictionsFor(PRACTICE_LOGS[0]);
    const bads = [
      predictionsFor(PRACTICE_LOGS[1]), // another log
      predictionsFor(FINAL_TEST_LOG),
      good.slice(1), // partial
      [...good.slice(0, -1), { ...good[good.length - 1], intent: "TURN_90" }],
      [...good.slice(0, -1), { ...good[good.length - 1], amount_cm: "40" }],
      [...good.slice(0, -1), null],
      "not an array",
    ];
    for (const round_predictions of bads) {
      const { state } = restoreMissionState({ job_id: ID, round_predictions }, DEFAULTS, newId);
      expect(state.round_predictions).toEqual([]);
    }
  });

  it("restores a well-formed round history", () => {
    const history = [
      { log_id: "practice-1", first_correct: 3, latest_correct: 5, total: PRACTICE_LOGS[0].examples.length },
      { log_id: "practice-2", first_correct: 0, latest_correct: 0, total: PRACTICE_LOGS[1].examples.length },
    ];
    const { state } = restoreMissionState({ job_id: ID, round_history: history }, DEFAULTS, newId);
    expect(state.round_history).toEqual(history);
    expect(state.round_history).not.toBe(history);
  });

  it("drops a round history with an unknown log, bad counts or a duplicate", () => {
    const total = PRACTICE_LOGS[0].examples.length;
    const good = { log_id: "practice-1", first_correct: 3, latest_correct: 5, total };
    const bads = [
      [good, { ...good, log_id: "final" }],
      [{ ...good, log_id: "practice-9" }],
      [{ ...good, total: total + 1 }],
      [{ ...good, first_correct: total + 1 }],
      [{ ...good, latest_correct: -1 }],
      [{ ...good, latest_correct: 2.5 }],
      [good, good],
      [good, null],
      "not an array",
    ];
    for (const round_history of bads) {
      const { state } = restoreMissionState({ job_id: ID, round_history }, DEFAULTS, newId);
      expect(state.round_history).toEqual([]);
    }
  });

  it("restores a final test aligned with the final-test log", () => {
    const finalTest = validFinalTest();
    const { state } = restoreMissionState({ job_id: ID, final_test: finalTest }, DEFAULTS, newId);
    expect(state.final_test).toEqual(finalTest);
    expect(state.final_test).not.toBe(finalTest);
  });

  it("drops a final test that is misaligned, miscounted or malformed", () => {
    const good = validFinalTest();
    const bads = [
      { ...good, predictions: predictionsFor(PRACTICE_LOGS[0]) },
      { ...good, predictions: good.predictions.slice(1) },
      { ...good, correct: good.correct - 1 },
      { ...good, total: good.total + 1 },
      { ...good, taken_at: "yesterday" },
      { ...good, taken_at: 5 },
      { ...good, examples_count: -1 },
      { ...good, examples_count: "25" },
      { ...good, predictions: [...good.predictions.slice(0, -1), null] },
      "taken",
      true,
    ];
    for (const final_test of bads) {
      const { state } = restoreMissionState({ job_id: ID, final_test }, DEFAULTS, newId);
      expect(state.final_test).toBeNull();
    }
  });

  it("restores a string trained_dataset_key and rejects other types", () => {
    expect(restoreMissionState({ job_id: ID, trained_dataset_key: "25:0a1b2c3d" }, DEFAULTS, newId).state.trained_dataset_key).toBe(
      "25:0a1b2c3d",
    );
    for (const trained_dataset_key of [25, null, {}]) {
      const { state } = restoreMissionState({ job_id: ID, trained_dataset_key }, DEFAULTS, newId);
      expect(state.trained_dataset_key).toBeNull();
    }
  });

  it("restores valid last_training_stats, copying only the known fields", () => {
    const stats = { parameters: 3528, training_seconds: 0.42, examples: 27, epochs: 20 };
    const { state } = restoreMissionState(
      { job_id: ID, last_training_stats: { ...stats, extra: "dropped" } },
      DEFAULTS,
      newId,
    );
    expect(state.last_training_stats).toEqual(stats);
    expect(state.last_training_stats).not.toHaveProperty("extra");
  });

  it("drops malformed last_training_stats", () => {
    const good = { parameters: 3528, training_seconds: 0.42, examples: 27, epochs: 20 };
    const bads = [
      "3528",
      [],
      { ...good, parameters: "3528" },
      { ...good, parameters: 0 },
      { ...good, parameters: 12.5 },
      { ...good, training_seconds: -1 },
      { ...good, training_seconds: Number.NaN },
      { ...good, examples: -3 },
      { parameters: 3528, training_seconds: 0.42, examples: 27 },
    ];
    for (const last_training_stats of bads) {
      const { state } = restoreMissionState({ job_id: ID, last_training_stats }, DEFAULTS, newId);
      expect(state.last_training_stats).toBeNull();
    }
  });

  it("restores a valid labeling_started_at and drops anything else", () => {
    const at = "2026-10-12T09:15:00.000Z";
    expect(restoreMissionState({ job_id: ID, labeling_started_at: at }, DEFAULTS, newId).state.labeling_started_at).toBe(
      at,
    );
    for (const labeling_started_at of ["not a date", 1760260500000, {}, null]) {
      const { state } = restoreMissionState({ job_id: ID, labeling_started_at }, DEFAULTS, newId);
      expect(state.labeling_started_at).toBeNull();
    }
  });

  it("restores a pre-PR-14 blob with no stats and no labeling time", () => {
    const blob = {
      job_id: ID,
      labeled_examples: [...BASE_EXAMPLES],
      model_trained: true,
      final_test: validFinalTest(),
      trained_dataset_key: "15:0a1b2c3d",
    };
    const { state, generated } = restoreMissionState(blob, DEFAULTS, newId);
    expect(generated).toBe(false);
    expect(state.model_trained).toBe(true);
    expect(state.final_test).not.toBeNull();
    expect(state.last_training_stats).toBeNull();
    expect(state.labeling_started_at).toBeNull();
  });

  it("defaults both PR-14 fields to null, so Start over clears them", () => {
    expect(DEFAULTS.last_training_stats).toBeNull();
    expect(DEFAULTS.labeling_started_at).toBeNull();
  });

  it("drops a pre-PR-10 blob's old-log Step 6 answers", () => {
    const blob = { job_id: ID, student_new_commands: "STRAIGHT 60", llm_commands_new: "STRAIGHT 60\nTURN 180" };
    const { state } = restoreMissionState(blob, DEFAULTS, newId);
    expect(state).not.toHaveProperty("student_new_commands");
    expect(state).not.toHaveProperty("llm_commands_new");
    expect(state.llm_commands_held_out).toBe("");
  });

  it("restores the pasted LLM answer for the held-out log", () => {
    const { state } = restoreMissionState({ job_id: ID, llm_commands_held_out: "STRAIGHT 7" }, DEFAULTS, newId);
    expect(state.llm_commands_held_out).toBe("STRAIGHT 7");
  });

  it("keeps a stored UUID and stored examples", () => {
    const examples = [{ sentence: "creep on 5 cm", intent: "STRAIGHT", amount_cm: 5 }];
    const { state, generated } = restoreMissionState(
      { job_id: ID, labeled_examples: examples },
      DEFAULTS,
      newId,
    );
    expect(generated).toBe(false);
    expect(state.job_id).toBe(ID);
    expect(state.labeled_examples).toEqual(examples);
  });

  it("keeps an empty stored dataset rather than reseeding it", () => {
    const { state } = restoreMissionState({ job_id: ID, labeled_examples: [] }, DEFAULTS, newId);
    expect(state.labeled_examples).toEqual([]);
  });

  it("falls back to the seed when stored examples are malformed", () => {
    const bad = [{ sentence: "turn", intent: "TURN_LEFT", amount_cm: 90 }];
    const { state } = restoreMissionState({ job_id: ID, labeled_examples: bad }, DEFAULTS, newId);
    expect(state.labeled_examples).toEqual(BASE_EXAMPLES);
  });

  it("regenerates a job_id that isn't a UUID", () => {
    for (const job_id of ["", "abc", 42, null]) {
      const { state, generated } = restoreMissionState({ job_id }, DEFAULTS, newId);
      expect(generated).toBe(true);
      expect(state.job_id).toBe(NEW_ID);
    }
  });

  it("returns defaults plus a new id for non-object input", () => {
    for (const stored of [null, "x", 3, []]) {
      const { state } = restoreMissionState(stored, DEFAULTS, newId);
      expect(state).toEqual({ ...DEFAULTS, job_id: NEW_ID });
    }
  });

  it("ignores wrongly typed string fields", () => {
    const { state } = restoreMissionState({ mission_log_1: 5 }, DEFAULTS, newId);
    expect(state.mission_log_1).toBe(DEFAULTS.mission_log_1);
  });

  it("does not share the defaults' examples array", () => {
    const { state } = restoreMissionState(null, DEFAULTS, newId);
    expect(state.labeled_examples).not.toBe(DEFAULTS.labeled_examples);
    expect(state.training_history).not.toBe(DEFAULTS.training_history);
    expect(state.round_predictions).not.toBe(DEFAULTS.round_predictions);
    expect(state.round_history).not.toBe(DEFAULTS.round_history);
  });
});

describe("isUuid", () => {
  it("accepts crypto.randomUUID() output and rejects other strings", () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
