// MissionState shape, defaults, and the pure restore logic for the
// sessionStorage blob. Kept out of MissionContext.tsx so it can be unit-tested
// without React.

import type { EpochMetric, Prediction, TrainingExample } from "@/lib/nlp/api";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import {
  DEFAULT_EPOCHS,
  DEFAULT_PRESET,
  isLearningRatePreset,
  isValidEpochs,
  type LearningRatePreset,
} from "@/lib/nlp/hyperparams";
import { INTENTS, isTrainingExample } from "@/lib/nlp/intents";
import { SAMPLE_MISSION_LOG } from "@/lib/nlp/data";
import { alignedPredictions, countCorrect } from "@/lib/nlp/rounds";
import { FINAL_TEST_LOG, PRACTICE_LOGS } from "@/lib/nlp/testLogs";

/** One practice log's scores in Step 5. */
export interface RoundResult {
  /** "practice-1" … "practice-5". */
  log_id: string;
  /** Score the first time this log was run. */
  first_correct: number;
  /** Score after the latest re-run (e.g. after retraining). */
  latest_correct: number;
  total: number;
}

/** The one-shot final test. Once set, training is locked for the session. */
export interface FinalTestResult {
  /** Aligned to FINAL_TEST_LOG.examples. */
  predictions: Prediction[];
  correct: number;
  total: number;
  /** ISO timestamp. */
  taken_at: string;
  /** Dataset size of the model that took the test. */
  examples_count: number;
}

export interface MissionState {
  /** Per-tab model id sent to the backend; "" until generated after mount. */
  job_id: string;
  labeled_examples: TrainingExample[];
  mission_log_1: string;
  /**
   * Step 6: the LLM's answer for the held-out log, pasted by the student.
   * Replaces `llm_commands_new` (answers for the old log), which is dropped.
   */
  llm_commands_held_out: string;
  /** Step 4: epochs for the next run, EPOCHS_MIN..EPOCHS_MAX. */
  epochs: number;
  learning_rate_preset: LearningRatePreset;
  /** Per-epoch metrics of the latest run; cleared when a new run starts. */
  training_history: EpochMetric[];
  /** Whether the backend holds a trained model for job_id (see useTrainingRun). */
  model_trained: boolean;
  /** Step 5: index into PRACTICE_LOGS of the current practice round. */
  practice_round: number;
  /**
   * Step 5: the model's last predictions on the current practice log, one per
   * sentence, in order. Replaces `predicted_new_commands` (the held-out log's),
   * which is dropped.
   */
  round_predictions: Prediction[];
  /** Step 5: one entry per practice log attempted, in the order played. */
  round_history: RoundResult[];
  /** Step 5's final test; non-null means training is locked. */
  final_test: FinalTestResult | null;
  /**
   * datasetKey() of the corpus behind the backend's current model, set when a
   * run completes; null when unknown. Step 5 compares it with the dataset now.
   */
  trained_dataset_key: string | null;
}

export const DEFAULTS: MissionState = {
  job_id: "",
  labeled_examples: [...BASE_EXAMPLES],
  mission_log_1: SAMPLE_MISSION_LOG,
  llm_commands_held_out: "",
  epochs: DEFAULT_EPOCHS,
  learning_rate_preset: DEFAULT_PRESET,
  training_history: [],
  model_trained: false,
  practice_round: 0,
  round_predictions: [],
  round_history: [],
  final_test: null,
  trained_dataset_key: null,
};

const STRING_FIELDS = [
  "mission_log_1",
  "llm_commands_held_out",
] as const satisfies readonly (keyof MissionState)[];

function isEpochMetric(value: unknown): value is EpochMetric {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    Number.isInteger(m.epoch) &&
    (m.epoch as number) >= 1 &&
    typeof m.intent_loss === "number" &&
    typeof m.amount_loss === "number" &&
    typeof m.intent_accuracy === "number"
  );
}

function isPrediction(value: unknown): value is Prediction {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.sentence === "string" &&
    typeof p.intent === "string" &&
    (INTENTS as readonly string[]).includes(p.intent) &&
    (p.amount_cm === null || (typeof p.amount_cm === "number" && Number.isFinite(p.amount_cm))) &&
    typeof p.command === "string"
  );
}

function copyPredictions(predictions: readonly Prediction[]): Prediction[] {
  return predictions.map((p) => ({ sentence: p.sentence, intent: p.intent, amount_cm: p.amount_cm, command: p.command }));
}

function isCount(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

function isRoundResult(value: unknown): value is RoundResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const log = PRACTICE_LOGS.find((l) => l.id === r.log_id);
  if (!log) return false;
  const total = log.examples.length;
  return r.total === total && isCount(r.first_correct, total) && isCount(r.latest_correct, total);
}

/** A stored final test, or null unless it is complete and consistent with FINAL_TEST_LOG. */
function restoreFinalTest(value: unknown): FinalTestResult | null {
  if (typeof value !== "object" || value === null) return null;
  const f = value as Record<string, unknown>;
  const predictions = f.predictions;
  if (!Array.isArray(predictions) || !predictions.every(isPrediction)) return null;
  if (alignedPredictions(FINAL_TEST_LOG, predictions) === null) return null;
  if (f.total !== FINAL_TEST_LOG.examples.length) return null;
  if (f.correct !== countCorrect(FINAL_TEST_LOG, predictions)) return null;
  if (typeof f.taken_at !== "string" || Number.isNaN(Date.parse(f.taken_at))) return null;
  if (!Number.isInteger(f.examples_count) || (f.examples_count as number) < 0) return null;
  return {
    predictions: copyPredictions(predictions),
    correct: f.correct,
    total: f.total,
    taken_at: f.taken_at,
    examples_count: f.examples_count as number,
  };
}

const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Builds a MissionState from a parsed sessionStorage blob of any vintage.
 * Only known keys with valid types are copied, so fields this version removed
 * (e.g. `actions_list`) never re-enter state. A missing or invalid `job_id` is
 * replaced via `newId`; `generated` reports whether that happened so the
 * caller can persist it immediately.
 */
export function restoreMissionState(
  stored: unknown,
  defaults: MissionState,
  newId: () => string,
): { state: MissionState; generated: boolean } {
  const blob = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const state: MissionState = {
    ...defaults,
    labeled_examples: [...defaults.labeled_examples],
    training_history: [...defaults.training_history],
    round_predictions: [...defaults.round_predictions],
    round_history: [...defaults.round_history],
  };

  for (const key of STRING_FIELDS) {
    const value = blob[key];
    if (typeof value === "string") state[key] = value;
  }

  const examples = blob.labeled_examples;
  if (Array.isArray(examples) && examples.every(isTrainingExample)) {
    state.labeled_examples = examples.map((e) => ({ sentence: e.sentence, intent: e.intent, amount_cm: e.amount_cm }));
  }

  if (isValidEpochs(blob.epochs)) state.epochs = blob.epochs;
  if (isLearningRatePreset(blob.learning_rate_preset)) state.learning_rate_preset = blob.learning_rate_preset;
  if (typeof blob.model_trained === "boolean") state.model_trained = blob.model_trained;

  // All or nothing: a partly valid history would draw a misleading curve.
  const history = blob.training_history;
  if (Array.isArray(history) && history.every(isEpochMetric)) {
    state.training_history = history.map((m) => ({
      epoch: m.epoch,
      intent_loss: m.intent_loss,
      amount_loss: m.amount_loss,
      intent_accuracy: m.intent_accuracy,
    }));
  }

  const round = blob.practice_round;
  if (Number.isInteger(round) && (round as number) >= 0 && (round as number) < PRACTICE_LOGS.length) {
    state.practice_round = round as number;
  }

  // All or nothing, like the history, and only for the current round's log:
  // a partial or other-log list would misalign with the table.
  const predictions = blob.round_predictions;
  if (
    Array.isArray(predictions) &&
    predictions.every(isPrediction) &&
    alignedPredictions(PRACTICE_LOGS[state.practice_round], predictions) !== null
  ) {
    state.round_predictions = copyPredictions(predictions);
  }

  const rounds = blob.round_history;
  if (
    Array.isArray(rounds) &&
    rounds.every(isRoundResult) &&
    new Set(rounds.map((r) => r.log_id)).size === rounds.length
  ) {
    state.round_history = rounds.map((r) => ({
      log_id: r.log_id,
      first_correct: r.first_correct,
      latest_correct: r.latest_correct,
      total: r.total,
    }));
  }

  // An invalid final test can only come from tampering, so falling back to
  // "not taken" (training unlocked) is acceptable.
  state.final_test = restoreFinalTest(blob.final_test);

  if (typeof blob.trained_dataset_key === "string") state.trained_dataset_key = blob.trained_dataset_key;

  if (isUuid(blob.job_id)) {
    state.job_id = blob.job_id;
    return { state, generated: false };
  }
  state.job_id = newId();
  return { state, generated: true };
}
