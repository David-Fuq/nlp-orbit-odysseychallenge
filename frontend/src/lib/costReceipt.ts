// Step 7's receipt maths, kept pure so it's unit-tested. The LLM side of every
// ratio comes from llmCostFacts.ts; nothing here hard-codes a published figure.

import type { TrainingExample, TrainingStats } from "@/lib/nlp/api";
import { isStarterExample } from "@/lib/nlp/baseExamples";
import { comparePaths } from "@/lib/nlp/simulator";
import { FINAL_TEST_LOG, referenceCommands } from "@/lib/nlp/testLogs";
import type { FinalTestResult } from "@/state/missionStorage";
import { LLAMA_31_GPU_HOURS, LLAMA_31_PARAMETERS, LLAMA_31_TOKENS } from "./llmCostFacts";

// Electricity assumptions, stated on the page next to the result. A laptop
// under load draws roughly 30-60 W; $0.15/kWh is a round figure near the US
// residential average. Both are deliberately plain: the point is the order of
// magnitude, which no reasonable choice here changes.
export const ASSUMED_LAPTOP_WATTS = 50;
export const ASSUMED_PRICE_PER_KWH_USD = 0.15;

const JOULES_PER_KWH = 3.6e6;
const SECONDS_PER_HOUR = 3600;

/** Rows the student added or edited, i.e. everything that isn't an unmodified starter example. */
export function countOwnExamples(examples: readonly TrainingExample[]): number {
  return examples.filter((e) => !isStarterExample(e)).length;
}

/** Total whitespace-separated words across the dataset's sentences. */
export function countWords(examples: readonly TrainingExample[]): number {
  return examples.reduce((sum, e) => sum + e.sentence.split(/\s+/).filter((w) => w !== "").length, 0);
}

/** Electricity cost of `seconds` of training under the assumptions above, in US cents. */
export function electricityCents(seconds: number): number {
  const kwh = (seconds * ASSUMED_LAPTOP_WATTS) / JOULES_PER_KWH;
  return kwh * ASSUMED_PRICE_PER_KWH_USD * 100;
}

/** Cents to 2 decimals, or "less than 0.01¢" when that rounds to zero. */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents * 100) / 100;
  return rounded === 0 ? "less than 0.01¢" : `${rounded.toFixed(2)}¢`;
}

/** Seconds for the receipt, e.g. "0.42"; "less than 0.01" for a run that fast. */
export function formatSeconds(seconds: number): string {
  return seconds < 0.005 ? "less than 0.01" : seconds.toFixed(2);
}

export interface ScaleRatios {
  /** Llama 3.1 training tokens ÷ the dataset's words (an approximation: tokens vs words). */
  text: number | null;
  /** Llama 3.1 405B parameters ÷ the student's. */
  size: number | null;
  /** The 405B model's GPU hours (in seconds) ÷ the student's training seconds. */
  time: number | null;
}

/** How many times larger the LLM's figure is; null where the student's side is missing or zero. */
export function scaleRatios(words: number, stats: TrainingStats | null): ScaleRatios {
  return {
    text: words > 0 ? LLAMA_31_TOKENS.value / words : null,
    size: stats && stats.parameters > 0 ? LLAMA_31_PARAMETERS.value / stats.parameters : null,
    time:
      stats && stats.training_seconds > 0
        ? (LLAMA_31_GPU_HOURS.value * SECONDS_PER_HOUR) / stats.training_seconds
        : null,
  };
}

const SCALES: [number, string][] = [
  [1e15, "quadrillion"],
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

/** A large number in words with two significant figures: "75 billion", "1.3 million", "940". */
export function formatLargeNumber(n: number): string {
  for (let i = 0; i < SCALES.length; i++) {
    const [scale, word] = SCALES[i];
    if (n < scale) continue;
    const v = Number((n / scale).toPrecision(2));
    // 999.6 million rounds to 1000 million: say "1 billion" instead.
    if (v >= 1000 && i > 0) return `1 ${SCALES[i - 1][1]}`;
    return `${v} ${word}`;
  }
  return Number(n.toPrecision(2)).toLocaleString("en-US");
}

/** Where a ratio's bar ends on a log axis from 1 to 10^maxDecade, as a 0..1 fraction. */
export function logBarFraction(ratio: number, maxDecade: number): number {
  if (!Number.isFinite(ratio) || ratio <= 1 || maxDecade <= 0) return 0;
  return Math.min(1, Math.log10(ratio) / maxDecade);
}

/** Whole minutes from `startIso` to `endMs`, or null if the start is invalid or after the end. */
export function labelingMinutes(startIso: string | null, endMs: number): number | null {
  if (startIso === null) return null;
  const start = Date.parse(startIso);
  if (Number.isNaN(start) || !Number.isFinite(endMs) || endMs < start) return null;
  return Math.floor((endMs - start) / 60_000);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "about 1 minute";
  if (minutes < 120) return `about ${minutes} minutes`;
  return `about ${Math.round(minutes / 60)} hours`;
}

export interface Step6Distances {
  /** cm between the model's end point and the reference's. */
  model: number;
  /** The same for the pasted LLM answer; null if none was pasted. */
  llm: number | null;
}

/** Step 6's path results, recomputed from saved state (Step 6 doesn't store them). */
export function step6Distances(finalTest: FinalTestResult, llmCommands: string): Step6Distances {
  const reference = referenceCommands(FINAL_TEST_LOG);
  const modelCommands = finalTest.predictions.map((p) => p.command).join("\n");
  return {
    model: comparePaths(modelCommands, reference).distance,
    llm: llmCommands.trim() ? comparePaths(llmCommands, reference).distance : null,
  };
}
