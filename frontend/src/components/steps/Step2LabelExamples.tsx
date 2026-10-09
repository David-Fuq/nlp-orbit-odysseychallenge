"use client";

import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import type { TrainingExample } from "@/lib/nlp/api";
import { isStarterExample } from "@/lib/nlp/baseExamples";
import { CANDIDATE_SENTENCES } from "@/lib/nlp/candidateSentences";
import { formatAmount, INTENT_LABELS, sameSentence } from "@/lib/nlp/intents";
import Callout from "@/components/ui/Callout";
import ExampleEditor from "@/components/ui/ExampleEditor";

const CARD = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";

export default function Step2LabelExamples() {
  const { state, setField } = useMission();
  const examples = state.labeled_examples;
  const starterCount = examples.filter(isStarterExample).length;

  const addExample = (example: TrainingExample): string | null => {
    if (examples.some((e) => sameSentence(e.sentence, example.sentence))) {
      return "That sentence is already in your dataset. You can edit it in Step 3.";
    }
    setField("labeled_examples", [...examples, example]);
    return null;
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">2. Label Examples</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Instead of writing rules, you&apos;ll <strong>teach by example</strong>: tell the robot what
          each sentence means, and those labels become its training data.
        </p>
      </header>

      <Callout tone="info" title="What does this sentence mean?">
        <ul className="list-disc space-y-1 pl-5">
          <li>Pick the one command each sentence is asking for.</li>
          <li>
            For <strong>STRAIGHT</strong> or <strong>BACKWARDS</strong>, also enter how many
            centimeters.
          </li>
          <li>
            Turns always rotate a fixed angle, so they <strong>never</strong> get a distance, even
            when the sentence mentions a number like &ldquo;90 degrees&rdquo;.
          </li>
          <li>Each label you add is one training example. The model learns from these, not from rules.</li>
        </ul>
      </Callout>

      <p className="text-sm text-slate-700 dark:text-slate-300">
        Your dataset: <strong>{examples.length}</strong> examples ({starterCount} starter,{" "}
        {examples.length - starterCount} yours).{" "}
        <Link href="/steps/3" className="font-medium text-sky-700 underline dark:text-sky-400">
          Review them in Step 3
        </Link>
        .
      </p>

      <ol className="space-y-4">
        {CANDIDATE_SENTENCES.map((sentence) => {
          const added = examples.find((e) => sameSentence(e.sentence, sentence));
          return (
            <li key={sentence} className={CARD}>
              {added ? (
                <div className="space-y-1">
                  <p className="text-slate-800 dark:text-slate-200">&ldquo;{sentence}&rdquo;</p>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    ✓ Added as {INTENT_LABELS[added.intent]}
                    {added.amount_cm !== null ? ` · ${formatAmount(added)}` : ""}
                  </p>
                </div>
              ) : (
                <ExampleEditor sentence={sentence} submitLabel="Add to my dataset" onSubmit={addExample} />
              )}
            </li>
          );
        })}
      </ol>

      <div className={CARD}>
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">Write your own sentence</h2>
        <ExampleEditor submitLabel="Add to my dataset" onSubmit={addExample} />
      </div>
    </section>
  );
}
