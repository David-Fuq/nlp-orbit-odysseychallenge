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

export interface MissionState {
  /** Per-tab model id sent to the backend; "" until generated after mount. */
  job_id: string;
  labeled_examples: TrainingExample[];
  mission_log_1: string;
  student_commands_1: string;
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
  /** Step 5: the model's last predictions on the held-out log, one per sentence, in order. */
  predicted_new_commands: Prediction[];
}

export const DEFAULTS: MissionState = {
  job_id: "",
  labeled_examples: [...BASE_EXAMPLES],
  mission_log_1: SAMPLE_MISSION_LOG,
  student_commands_1: "",
  llm_commands_held_out: "",
  epochs: DEFAULT_EPOCHS,
  learning_rate_preset: DEFAULT_PRESET,
  training_history: [],
  model_trained: false,
  predicted_new_commands: [],
};

const STRING_FIELDS = [
  "mission_log_1",
  "student_commands_1",
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    predicted_new_commands: [...defaults.predicted_new_commands],
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

  // All or nothing, like the history: a partial list would misalign with the log.
  const predictions = blob.predicted_new_commands;
  if (Array.isArray(predictions) && predictions.every(isPrediction)) {
    state.predicted_new_commands = predictions.map((p) => ({
      sentence: p.sentence,
      intent: p.intent,
      amount_cm: p.amount_cm,
      command: p.command,
    }));
  }

  if (isUuid(blob.job_id)) {
    state.job_id = blob.job_id;
    return { state, generated: false };
  }
  state.job_id = newId();
  return { state, generated: true };
}
