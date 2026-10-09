import { describe, expect, it } from "vitest";
import { BASE_EXAMPLES, isStarterExample } from "./baseExamples";
import { CANDIDATE_SENTENCES } from "./candidateSentences";
import { countByIntent, INTENTS, isTrainingExample, sameSentence } from "./intents";

describe("BASE_EXAMPLES", () => {
  it("is a small trimmed set: 3-4 examples per intent", () => {
    const counts = countByIntent(BASE_EXAMPLES);
    for (const intent of INTENTS) {
      expect(counts[intent]).toBeGreaterThanOrEqual(3);
      expect(counts[intent]).toBeLessThanOrEqual(4);
    }
  });

  it("only holds valid examples with unique sentences", () => {
    expect(BASE_EXAMPLES.every(isTrainingExample)).toBe(true);
    expect(new Set(BASE_EXAMPLES.map((e) => e.sentence)).size).toBe(BASE_EXAMPLES.length);
  });
});

describe("isStarterExample", () => {
  it("matches unmodified starter examples only", () => {
    expect(BASE_EXAMPLES.every((e) => isStarterExample({ ...e }))).toBe(true);
    const edited = { ...BASE_EXAMPLES[0], amount_cm: 999 };
    expect(isStarterExample(edited)).toBe(false);
  });
});

describe("CANDIDATE_SENTENCES", () => {
  it("doesn't repeat a starter sentence or itself", () => {
    for (const sentence of CANDIDATE_SENTENCES) {
      expect(BASE_EXAMPLES.some((e) => sameSentence(e.sentence, sentence))).toBe(false);
    }
    expect(new Set(CANDIDATE_SENTENCES).size).toBe(CANDIDATE_SENTENCES.length);
  });
});
