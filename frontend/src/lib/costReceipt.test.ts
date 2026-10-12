import { describe, expect, it } from "vitest";
import type { TrainingExample } from "@/lib/nlp/api";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import { exampleCommand } from "@/lib/nlp/grading";
import { FINAL_TEST_LOG, referenceCommands } from "@/lib/nlp/testLogs";
import type { FinalTestResult } from "@/state/missionStorage";
import {
  ASSUMED_LAPTOP_WATTS,
  ASSUMED_PRICE_PER_KWH_USD,
  countOwnExamples,
  countWords,
  electricityCents,
  formatCents,
  formatLargeNumber,
  formatMinutes,
  formatSeconds,
  labelingMinutes,
  logBarFraction,
  scaleRatios,
  step6Distances,
} from "./costReceipt";
import { LLAMA_31_GPU_HOURS, LLAMA_31_PARAMETERS, LLAMA_31_TOKENS } from "./llmCostFacts";

const STATS = { parameters: 4000, training_seconds: 0.5, examples: 20, epochs: 20 };

describe("countOwnExamples", () => {
  it("counts added and edited rows, not unmodified starter rows", () => {
    const edited: TrainingExample = { ...BASE_EXAMPLES[0], amount_cm: 61 };
    const added: TrainingExample = { sentence: "creep ahead 12 cm", intent: "STRAIGHT", amount_cm: 12 };
    expect(countOwnExamples(BASE_EXAMPLES)).toBe(0);
    expect(countOwnExamples([edited, ...BASE_EXAMPLES.slice(1), added])).toBe(2);
    expect(countOwnExamples([])).toBe(0);
  });
});

describe("countWords", () => {
  it("sums whitespace-separated words across sentences", () => {
    const examples: TrainingExample[] = [
      { sentence: "now turn left", intent: "TURN_LEFT", amount_cm: null },
      { sentence: "  go   forward 40 cm ", intent: "STRAIGHT", amount_cm: 40 },
    ];
    expect(countWords(examples)).toBe(7);
    expect(countWords([])).toBe(0);
  });
});

describe("electricity", () => {
  it("is seconds × watts × price per kWh, in cents", () => {
    const hourCents = ASSUMED_LAPTOP_WATTS / 1000 * ASSUMED_PRICE_PER_KWH_USD * 100;
    expect(electricityCents(3600)).toBeCloseTo(hourCents, 10);
    expect(electricityCents(0)).toBe(0);
  });

  it("shows less than 0.01¢ when the cost rounds to zero", () => {
    expect(formatCents(electricityCents(0.5))).toBe("less than 0.01¢");
    expect(formatCents(0)).toBe("less than 0.01¢");
    expect(formatCents(0.0049)).toBe("less than 0.01¢");
    expect(formatCents(0.005)).toBe("0.01¢");
    expect(formatCents(0.75)).toBe("0.75¢");
  });

  it("formats seconds, with a floor for very fast runs", () => {
    expect(formatSeconds(0.4249)).toBe("0.42");
    expect(formatSeconds(0.001)).toBe("less than 0.01");
  });
});

describe("scaleRatios", () => {
  it("divides the published figures by the student's numbers", () => {
    const r = scaleRatios(200, STATS);
    expect(r.text).toBe(LLAMA_31_TOKENS.value / 200);
    expect(r.size).toBe(LLAMA_31_PARAMETERS.value / 4000);
    expect(r.time).toBe((LLAMA_31_GPU_HOURS.value * 3600) / 0.5);
  });

  it("returns null where the student's side is missing or zero", () => {
    expect(scaleRatios(0, null)).toEqual({ text: null, size: null, time: null });
    expect(scaleRatios(10, { ...STATS, training_seconds: 0 }).time).toBeNull();
  });
});

describe("formatLargeNumber", () => {
  it("uses two significant figures and words", () => {
    expect(formatLargeNumber(75_000_000_000)).toBe("75 billion");
    expect(formatLargeNumber(101_250_000)).toBe("100 million");
    expect(formatLargeNumber(1_340_000)).toBe("1.3 million");
    expect(formatLargeNumber(15e12)).toBe("15 trillion");
    expect(formatLargeNumber(1000)).toBe("1 thousand");
    expect(formatLargeNumber(942)).toBe("940");
  });

  it("moves up a word instead of saying 1000 million", () => {
    expect(formatLargeNumber(999_700_000)).toBe("1 billion");
  });
});

describe("logBarFraction", () => {
  it("maps decades linearly and clamps to 0..1", () => {
    expect(logBarFraction(1e6, 12)).toBeCloseTo(0.5, 10);
    expect(logBarFraction(1e20, 12)).toBe(1);
    expect(logBarFraction(1, 12)).toBe(0);
    expect(logBarFraction(0.5, 12)).toBe(0);
    expect(logBarFraction(Number.NaN, 12)).toBe(0);
  });
});

describe("labeling time", () => {
  const start = "2026-10-12T09:00:00.000Z";
  const at = (iso: string) => Date.parse(iso);

  it("counts whole minutes from the start to the end", () => {
    expect(labelingMinutes(start, at("2026-10-12T09:42:30.000Z"))).toBe(42);
    expect(labelingMinutes(start, at(start))).toBe(0);
  });

  it("is null without a valid start, or when the end comes first", () => {
    expect(labelingMinutes(null, at(start))).toBeNull();
    expect(labelingMinutes("garbage", at(start))).toBeNull();
    expect(labelingMinutes(start, at("2026-10-12T08:00:00.000Z"))).toBeNull();
  });

  it("formats minutes for the receipt", () => {
    expect(formatMinutes(0)).toBe("less than a minute");
    expect(formatMinutes(1)).toBe("about 1 minute");
    expect(formatMinutes(42)).toBe("about 42 minutes");
    expect(formatMinutes(185)).toBe("about 3 hours");
  });
});

describe("step6Distances", () => {
  const perfect: FinalTestResult = {
    predictions: FINAL_TEST_LOG.examples.map((e) => ({ ...e, command: exampleCommand(e) })),
    correct: FINAL_TEST_LOG.examples.length,
    total: FINAL_TEST_LOG.examples.length,
    taken_at: "2026-10-12T10:00:00.000Z",
    examples_count: 15,
  };

  it("recomputes the model's and the LLM's distances from saved state", () => {
    const d = step6Distances(perfect, referenceCommands(FINAL_TEST_LOG));
    expect(d.model).toBe(0);
    expect(d.llm).toBe(0);
  });

  it("has no LLM distance when nothing was pasted", () => {
    expect(step6Distances(perfect, "   ").llm).toBeNull();
  });
});
