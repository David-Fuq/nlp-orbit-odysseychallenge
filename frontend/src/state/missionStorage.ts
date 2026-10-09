// MissionState shape, defaults, and the pure restore logic for the
// sessionStorage blob. Kept out of MissionContext.tsx so it can be unit-tested
// without React.

import type { TrainingExample } from "@/lib/nlp/api";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import { isTrainingExample } from "@/lib/nlp/intents";
import {
  DEFAULT_LEFT_SYNONYMS,
  DEFAULT_MOVE_SYNONYMS,
  DEFAULT_RIGHT_SYNONYMS,
  DEFAULT_TURN_SYNONYMS,
  SAMPLE_MISSION_LOG,
} from "@/lib/nlp/data";

/**
 * Compatibility stub: fields of the old rule-based mechanism that Steps 4 and
 * 5 still read. They stay required so those steps keep compiling unchanged.
 */
export interface LegacyRuleFields {
  /** @deprecated Rule-based leftover; PR-08/PR-09 remove with Steps 4/5. */
  move_synonyms: string;
  /** @deprecated Rule-based leftover; PR-08/PR-09 remove with Steps 4/5. */
  turn_synonyms: string;
  /** @deprecated Rule-based leftover; PR-08/PR-09 remove with Steps 4/5. */
  left_synonyms: string;
  /** @deprecated Rule-based leftover; PR-08/PR-09 remove with Steps 4/5. */
  right_synonyms: string;
  /** @deprecated Rule-based leftover; PR-08 removes with Step 4. */
  student_dict_notes: string;
}

export interface MissionState extends LegacyRuleFields {
  /** Per-tab model id sent to the backend; "" until generated after mount. */
  job_id: string;
  labeled_examples: TrainingExample[];
  mission_log_1: string;
  student_commands_1: string;
  student_new_commands: string;
  llm_commands_new: string;
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
  student_dict_notes: "",
  student_new_commands: "",
  llm_commands_new: "",
};

const STRING_FIELDS = [
  "mission_log_1",
  "student_commands_1",
  "move_synonyms",
  "turn_synonyms",
  "left_synonyms",
  "right_synonyms",
  "student_dict_notes",
  "student_new_commands",
  "llm_commands_new",
] as const satisfies readonly (keyof MissionState)[];

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
  const state: MissionState = { ...defaults, labeled_examples: [...defaults.labeled_examples] };

  for (const key of STRING_FIELDS) {
    const value = blob[key];
    if (typeof value === "string") state[key] = value;
  }

  const examples = blob.labeled_examples;
  if (Array.isArray(examples) && examples.every(isTrainingExample)) {
    state.labeled_examples = examples.map((e) => ({ sentence: e.sentence, intent: e.intent, amount_cm: e.amount_cm }));
  }

  if (isUuid(blob.job_id)) {
    state.job_id = blob.job_id;
    return { state, generated: false };
  }
  state.job_id = newId();
  return { state, generated: true };
}
