import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import Step1ReadLog from "@/components/steps/Step1ReadLog";
import Step2LabelExamples from "@/components/steps/Step2LabelExamples";
import Step3ReviewDataset from "@/components/steps/Step3ReviewDataset";
import Step4Train from "@/components/steps/Step4Train";
import Step5TestIterate from "@/components/steps/Step5TestIterate";
import Step6CompareLLM from "@/components/steps/Step6CompareLLM";
import { STEPS } from "@/lib/steps";

const STEP_COMPONENTS: Record<number, ComponentType> = {
  1: Step1ReadLog,
  2: Step2LabelExamples,
  3: Step3ReviewDataset,
  4: Step4Train,
  5: Step5TestIterate,
  6: Step6CompareLLM,
};

export function generateStaticParams() {
  return STEPS.map((step) => ({ n: String(step.n) }));
}

export default async function StepPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const StepComponent = STEP_COMPONENTS[Number(n)];
  if (!StepComponent) notFound();
  return <StepComponent />;
}
