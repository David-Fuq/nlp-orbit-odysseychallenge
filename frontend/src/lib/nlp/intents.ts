// The five intents and the rules for turning a student's label into a
// TrainingExample. Pure, so the labeling UI and its tests share one source.

import type { TrainingExample } from "./api";

export type Intent = TrainingExample["intent"];

export const INTENTS: readonly Intent[] = [
  "STRAIGHT",
  "BACKWARDS",
  "TURN_RIGHT",
  "TURN_LEFT",
  "TURN_180",
];

/** Student-facing names: the command words, not the internal labels. */
export const INTENT_LABELS: Record<Intent, string> = {
  STRAIGHT: "STRAIGHT",
  BACKWARDS: "BACKWARDS",
  TURN_RIGHT: "TURN RIGHT",
  TURN_LEFT: "TURN LEFT",
  TURN_180: "TURN 180",
};

/** Only STRAIGHT and BACKWARDS carry a distance; turns rotate a fixed angle. */
export function intentTakesAmount(intent: Intent): boolean {
  return intent === "STRAIGHT" || intent === "BACKWARDS";
}

export function formatAmount(example: TrainingExample): string {
  return example.amount_cm === null ? "—" : `${example.amount_cm} cm`;
}

export function countByIntent(examples: readonly TrainingExample[]): Record<Intent, number> {
  const counts = Object.fromEntries(INTENTS.map((i) => [i, 0])) as Record<Intent, number>;
  for (const ex of examples) counts[ex.intent] += 1;
  return counts;
}

export type BuildResult = { ok: true; example: TrainingExample } | { ok: false; error: string };

/**
 * Validates a label. Mirrors the backend's corpus check
 * (backend/app/routers/train.py `_to_corpus_examples`): `amount_cm` is
 * required for STRAIGHT/BACKWARDS and always null for a turn, whatever
 * `amountText` holds.
 */
export function buildExample(sentence: string, intent: Intent | null, amountText: string): BuildResult {
  const trimmed = sentence.trim();
  if (trimmed === "") return { ok: false, error: "Write a sentence first." };
  if (intent === null) return { ok: false, error: "Pick what the sentence means." };
  if (!intentTakesAmount(intent)) {
    return { ok: true, example: { sentence: trimmed, intent, amount_cm: null } };
  }
  const amount = amountText.trim() === "" ? NaN : Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: `${INTENT_LABELS[intent]} needs a distance in centimeters greater than 0.` };
  }
  return { ok: true, example: { sentence: trimmed, intent, amount_cm: amount } };
}

/** Type guard for examples read back from sessionStorage. */
export function isTrainingExample(value: unknown): value is TrainingExample {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.sentence !== "string" || v.sentence.trim() === "") return false;
  if (typeof v.intent !== "string" || !(INTENTS as readonly string[]).includes(v.intent)) return false;
  if (intentTakesAmount(v.intent as Intent)) {
    return typeof v.amount_cm === "number" && Number.isFinite(v.amount_cm) && v.amount_cm > 0;
  }
  return v.amount_cm === null;
}

/** Duplicate check: same sentence ignoring case and surrounding whitespace. */
export function sameSentence(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
