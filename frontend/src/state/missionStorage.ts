// MissionState shape, defaults, and the pure restore logic for the
// sessionStorage blob. Kept out of MissionContext.tsx so it can be unit-tested
// without React.

import type { EpochMetric, TrainingExample } from "@/lib/nlp/api";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import {
  DEFAULT_EPOCHS,
  DEFAULT_PRESET,
  isLearningRatePreset,
  isValidEpochs,
  type LearningRatePreset,
} from "@/lib/nlp/hyperparams";
import { isTrainingExample } from "@/lib/nlp/intents";
import {
  DEFAULT_LEFT_SYNONYMS,
  DEFAULT_MOVE_SYNONYMS,
  DEFAULT_RIGHT_SYNONYMS,
  DEFAULT_TURN_SYNONYMS,
  SAMPLE_MISSION_LOG,
} from "@/lib/nlp/data";

/**
 * Compatibility stub: fields of the old rule-based mechanism that Step 5 still
 * reads. They stay required so that step keeps compiling unchanged.
 */
export interface LegacyRuleFields {
  /** @deprecated Rule-based leftover; PR-09 removes with Step 5. */
  move_synonyms: string;
  /** @deprecated Rule-based leftover; PR-09 removes with Step 5. */
  turn_synonyms: string;
  /** @deprecated Rule-based leftover; PR-09 removes with Step 5. */
  left_synonyms: string;
  /** @deprecated Rule-based leftover; PR-09 removes with Step 5. */
  right_synonyms: string;
}

export interface MissionState extends LegacyRuleFields {
  /** Per-tab model id sent to the backend; "" until generated after mount. */
  job_id: string;
  labeled_examples: TrainingExample[];
  mission_log_1: string;
  student_commands_1: string;
  student_new_commands: string;
  llm_commands_new: string;
  /** Step 4: epochs for the next run, EPOCHS_MIN..EPOCHS_MAX. */
  epochs: number;
  learning_rate_preset: LearningRatePreset;
  /** Per-epoch metrics of the latest run; cleared when a new run starts. */
  training_history: EpochMetric[];
  /** Whether the backend holds a trained model for job_id (see Step4Train). */
  model_trained: boolean;
}

export const DEFAULTS: MissionState = {
  job_id: "",
  labeled_examples: [...BASE_EXAMPLES],
  mission_log_1: SAMPLE_MISSION_LOG,
  student_commands_1: "",
  move_synonyms: DEFAULT_MOVE_SYNONYMS,
  turn_synonyms: DEFAULT_TURN_SYNONYMS,
  left_synonyms: DEFAULT_LEFT_SYNONYMS,
  right_synonyms: DEFAULT_RIGHT_SYNONYMS,
  student_new_commands: "",
  llm_commands_new: "",
  epochs: DEFAULT_EPOCHS,
  learning_rate_preset: DEFAULT_PRESET,
  training_history: [],
  model_trained: false,
};

const STRING_FIELDS = [
  "mission_log_1",
  "student_commands_1",
  "move_synonyms",
  "turn_synonyms",
  "left_synonyms",
  "right_synonyms",
  "student_new_commands",
  "llm_commands_new",
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

  if (isUuid(blob.job_id)) {
    state.job_id = blob.job_id;
    return { state, generated: false };
  }
  state.job_id = newId();
  return { state, generated: true };
}
