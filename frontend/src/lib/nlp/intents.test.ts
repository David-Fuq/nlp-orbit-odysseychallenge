import { describe, expect, it } from "vitest";
import { buildExample, countByIntent, formatAmount, INTENTS, isTrainingExample, sameSentence } from "./intents";

describe("buildExample", () => {
  it("trims the sentence and keeps the amount for STRAIGHT/BACKWARDS", () => {
    expect(buildExample("  roll ahead 40 cm ", "STRAIGHT", "40")).toEqual({
      ok: true,
      example: { sentence: "roll ahead 40 cm", intent: "STRAIGHT", amount_cm: 40 },
    });
    expect(buildExample("back up 12.5 cm", "BACKWARDS", "12.5")).toMatchObject({
      ok: true,
      example: { amount_cm: 12.5 },
    });
  });

  it("never gives a turn an amount, even when one is typed", () => {
    for (const intent of ["TURN_RIGHT", "TURN_LEFT", "TURN_180"] as const) {
      const result = buildExample("swing 90 degrees clockwise", intent, "90");
      expect(result).toEqual({
        ok: true,
        example: { sentence: "swing 90 degrees clockwise", intent, amount_cm: null },
      });
    }
  });

  it("rejects a missing, non-numeric, zero or negative distance", () => {
    for (const amount of ["", "  ", "abc", "0", "-5", "Infinity"]) {
      expect(buildExample("go forward", "STRAIGHT", amount).ok).toBe(false);
    }
  });

  it("rejects an empty sentence or a missing intent", () => {
    expect(buildExample("   ", "TURN_LEFT", "").ok).toBe(false);
    expect(buildExample("turn left", null, "").ok).toBe(false);
  });
});

describe("countByIntent", () => {
  it("always reports all five intents", () => {
    expect(countByIntent([])).toEqual({ STRAIGHT: 0, BACKWARDS: 0, TURN_RIGHT: 0, TURN_LEFT: 0, TURN_180: 0 });
    const counts = countByIntent([
      { sentence: "a", intent: "STRAIGHT", amount_cm: 1 },
      { sentence: "b", intent: "STRAIGHT", amount_cm: 2 },
      { sentence: "c", intent: "TURN_180", amount_cm: null },
    ]);
    expect(Object.keys(counts).sort()).toEqual([...INTENTS].sort());
    expect(counts.STRAIGHT).toBe(2);
    expect(counts.TURN_180).toBe(1);
    expect(counts.TURN_LEFT).toBe(0);
  });
});

describe("isTrainingExample", () => {
  it("accepts well-formed examples", () => {
    expect(isTrainingExample({ sentence: "go", intent: "STRAIGHT", amount_cm: 10 })).toBe(true);
    expect(isTrainingExample({ sentence: "turn", intent: "TURN_LEFT", amount_cm: null })).toBe(true);
  });

  it("rejects bad shapes and amount/intent mismatches", () => {
    expect(isTrainingExample(null)).toBe(false);
    expect(isTrainingExample("go")).toBe(false);
    expect(isTrainingExample({ sentence: "", intent: "STRAIGHT", amount_cm: 10 })).toBe(false);
    expect(isTrainingExample({ sentence: "go", intent: "MOVE", amount_cm: 10 })).toBe(false);
    expect(isTrainingExample({ sentence: "go", intent: "STRAIGHT", amount_cm: null })).toBe(false);
    expect(isTrainingExample({ sentence: "go", intent: "STRAIGHT", amount_cm: "10" })).toBe(false);
    expect(isTrainingExample({ sentence: "turn", intent: "TURN_RIGHT", amount_cm: 90 })).toBe(false);
    expect(isTrainingExample({ sentence: "turn", intent: "TURN_RIGHT" })).toBe(false);
  });
});

describe("helpers", () => {
  it("formats amounts with a dash for turns", () => {
    expect(formatAmount({ sentence: "x", intent: "STRAIGHT", amount_cm: 40 })).toBe("40 cm");
    expect(formatAmount({ sentence: "x", intent: "TURN_LEFT", amount_cm: null })).toBe("—");
  });

  it("compares sentences ignoring case and surrounding whitespace", () => {
    expect(sameSentence(" Turn Left ", "turn left")).toBe(true);
    expect(sameSentence("turn left", "turn right")).toBe(false);
  });
});
