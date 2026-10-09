// Step 4's training knobs: the learning-rate presets and the epochs range.

export type LearningRatePreset = "careful" | "balanced" | "aggressive";

export const LEARNING_RATE_PRESET_KEYS: readonly LearningRatePreset[] = ["careful", "balanced", "aggressive"];

/**
 * Adam learning rates, tuned against the real trainer (backend
 * app/services/model.py) on the starter dataset and on the full base corpus.
 * They sit above the plan's starting points because the amount target is
 * scaled by /100 and Adam normalises step sizes:
 * - careful: still learning at 20 epochs (accuracy ~0.5-0.75), converges by 100.
 * - balanced: converges cleanly within 20 epochs.
 * - aggressive: the losses spike in the first few epochs and the run settles
 *   well short of balanced (accuracy ~0.3-0.6) even at 100 epochs.
 */
export const LEARNING_RATE_PRESETS: Record<LearningRatePreset, number> = {
  careful: 0.003,
  balanced: 0.03,
  aggressive: 0.5,
};

export const PRESET_LABELS: Record<LearningRatePreset, { title: string; hint: string }> = {
  careful: { title: "Careful", hint: "Small, safe steps. Learns slowly." },
  balanced: { title: "Balanced", hint: "A good default for this model." },
  aggressive: { title: "Aggressive", hint: "Big jumps. Can overshoot and get stuck." },
};

export const DEFAULT_PRESET: LearningRatePreset = "balanced";

export const EPOCHS_MIN = 5;
export const EPOCHS_MAX = 100;
export const DEFAULT_EPOCHS = 20;

export function isLearningRatePreset(value: unknown): value is LearningRatePreset {
  return typeof value === "string" && (LEARNING_RATE_PRESET_KEYS as readonly string[]).includes(value);
}

export function isValidEpochs(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= EPOCHS_MIN && (value as number) <= EPOCHS_MAX;
}
