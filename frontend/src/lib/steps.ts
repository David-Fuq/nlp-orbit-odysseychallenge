// Step metadata shared by the sidebar nav and the step route.

export interface StepMeta {
  n: number;
  title: string;
}

export const STEPS: StepMeta[] = [
  { n: 1, title: "Read Mission Log" },
  { n: 2, title: "Label Examples" },
  { n: 3, title: "Review Dataset" },
  { n: 4, title: "Train Your Model" },
  { n: 5, title: "Test & Iterate" },
  { n: 6, title: "Compare with LLM" },
];

export const TOTAL_STEPS = STEPS.length;
