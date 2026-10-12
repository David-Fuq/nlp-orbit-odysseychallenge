// Step 7's published figures for large LLMs: the only place these numbers
// live. Every figure here was checked against its source on `retrieved`, and
// the table was approved by David (2026-10-11, with the moved AI Index links
// signed off on 2026-10-12). Changing a value, a source or the set of rows
// needs his sign-off again (see pr-based-plan/PR-14).
//
// `text` is the exact on-page wording; `value` is the same figure as a number,
// for Step 7's ratios. The AI Index dollar figures are compute only (cloud
// rental prices, inflation-adjusted), which the page says next to them.

export interface LlmCostFact {
  id: string;
  /** What the figure measures, e.g. "Training text". */
  label: string;
  /** Which model it is about. */
  model: string;
  value: number;
  /** Exact on-page wording of the figure. */
  text: string;
  /** Who says so, and how sure: "reported by Meta", "estimated by …". */
  qualifier: string;
  sourceTitle: string;
  sourceUrl: string;
  /** ISO date the figure was last checked against its source. */
  retrieved: string;
}

const LLAMA_31_CARD = {
  sourceTitle: "Meta Llama 3.1 model card",
  sourceUrl: "https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/MODEL_CARD.md",
  retrieved: "2026-10-12",
};

const LLAMA_2_PAPER = {
  sourceTitle: "Llama 2 paper (Touvron et al., 2023), section 3.2.1",
  sourceUrl: "https://arxiv.org/abs/2307.09288",
  retrieved: "2026-10-12",
};

// The report's old aiindex.stanford.edu links now redirect (report page) or
// return 403 (PDF); this is where the 2024 report lives now.
const AI_INDEX_2024 = {
  qualifier: "estimated by the Stanford AI Index with Epoch AI",
  sourceTitle: "Stanford AI Index Report 2024, chapter 1, p. 63",
  sourceUrl: "https://hai.stanford.edu/ai-index/2024-ai-index-report",
  retrieved: "2026-10-12",
};

export const LLAMA_31_TOKENS: LlmCostFact = {
  id: "llama31-tokens",
  label: "Training text",
  model: "Llama 3.1",
  value: 15e12,
  text: "about 15 trillion tokens of text",
  qualifier: "reported by Meta",
  ...LLAMA_31_CARD,
};

export const LLAMA_31_PARAMETERS: LlmCostFact = {
  id: "llama31-parameters",
  label: "Model size",
  model: "Llama 3.1",
  value: 405e9,
  text: "405 billion parameters in its largest version (Llama 3.1 405B)",
  qualifier: "reported by Meta",
  ...LLAMA_31_CARD,
};

export const LLAMA_31_GPU_HOURS: LlmCostFact = {
  id: "llama31-gpu-hours",
  label: "Training compute",
  model: "Llama 3.1",
  // The 405B model only, to compare with one model of the student's.
  value: 30.84e6,
  text: "30.84 million GPU hours to train the 405B model, and 39.3 million for all three sizes, on Nvidia H100 GPUs",
  qualifier: "reported by Meta",
  ...LLAMA_31_CARD,
};

export const LLAMA_31_EMISSIONS: LlmCostFact = {
  id: "llama31-emissions",
  label: "Training emissions",
  model: "Llama 3.1",
  value: 11_390,
  text: "about 11,390 tons of CO₂-equivalent (location-based)",
  qualifier: "estimated by Meta",
  ...LLAMA_31_CARD,
};

export const LLAMA_2_PREFERENCES: LlmCostFact = {
  id: "llama2-preferences",
  label: "Human feedback",
  model: "Llama 2",
  value: 1e6,
  text: "over 1 million comparisons in which a person chose which of two answers they preferred",
  qualifier: "reported by Meta",
  ...LLAMA_2_PAPER,
};

export const GPT_4_COST: LlmCostFact = {
  id: "gpt4-cost",
  label: "Training cost",
  model: "GPT-4",
  value: 78e6,
  text: "about $78 million of computing",
  ...AI_INDEX_2024,
};

export const GEMINI_ULTRA_COST: LlmCostFact = {
  id: "gemini-ultra-cost",
  label: "Training cost",
  model: "Gemini Ultra",
  value: 191e6,
  text: "about $191 million of computing",
  ...AI_INDEX_2024,
};

export const TRANSFORMER_COST: LlmCostFact = {
  id: "transformer-cost",
  label: "Training cost, for contrast",
  model: "original Transformer, 2017",
  value: 900,
  text: "about $900 of computing, for the model that introduced the design today's LLMs are built on",
  ...AI_INDEX_2024,
};

/** Every figure, in the order Step 7 lists them. */
export const LLM_COST_FACTS: readonly LlmCostFact[] = [
  LLAMA_31_TOKENS,
  LLAMA_31_PARAMETERS,
  LLAMA_31_GPU_HOURS,
  LLAMA_31_EMISSIONS,
  LLAMA_2_PREFERENCES,
  GPT_4_COST,
  GEMINI_ULTRA_COST,
  TRANSFORMER_COST,
];
