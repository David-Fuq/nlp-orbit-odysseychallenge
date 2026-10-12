import { describe, expect, it } from "vitest";
import { LLM_COST_FACTS } from "./llmCostFacts";

describe("LLM_COST_FACTS", () => {
  it("gives every figure a value, wording, qualifier, https source and retrieved date", () => {
    for (const fact of LLM_COST_FACTS) {
      expect(fact.value, fact.id).toBeGreaterThan(0);
      expect(fact.text.trim(), fact.id).not.toBe("");
      expect(fact.qualifier, fact.id).toMatch(/^(reported|estimated) by /);
      expect(fact.sourceTitle.trim(), fact.id).not.toBe("");
      expect(fact.sourceUrl, fact.id).toMatch(/^https:\/\//);
      expect(fact.retrieved, fact.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(fact.retrieved)), fact.id).toBe(false);
    }
  });

  it("has unique ids", () => {
    expect(new Set(LLM_COST_FACTS.map((f) => f.id)).size).toBe(LLM_COST_FACTS.length);
  });

  it("does not carry the unverified Altman remark or the dead AI Index links", () => {
    for (const fact of LLM_COST_FACTS) {
      expect(fact.text).not.toMatch(/100 million/);
      expect(fact.sourceUrl).not.toMatch(/wired\.com|aiindex\.stanford\.edu/);
    }
  });
});
