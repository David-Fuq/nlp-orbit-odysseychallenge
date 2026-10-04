// Step metadata shared by the sidebar nav and the step route.

export interface StepMeta {
  n: number;
  title: string;
}

export const STEPS: StepMeta[] = [
  { n: 1, title: "Read Mission Log" },
  { n: 2, title: "Extract Key Phrases" },
  { n: 3, title: "Translate to Commands" },
  { n: 4, title: "Build Dictionary" },
  { n: 5, title: "Decode New Log" },
  { n: 6, title: "Compare with LLM" },
];

export const TOTAL_STEPS = STEPS.length;
