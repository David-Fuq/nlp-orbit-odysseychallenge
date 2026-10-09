"use client";

import { useMission } from "@/state/MissionContext";
import type { TrainingExample } from "@/lib/nlp/api";
import { isStarterExample } from "@/lib/nlp/baseExamples";
import { sameSentence } from "@/lib/nlp/intents";
import Callout from "@/components/ui/Callout";
import DatasetTable from "@/components/ui/DatasetTable";
import ExampleEditor from "@/components/ui/ExampleEditor";
import IntentCounts from "@/components/ui/IntentCounts";

const DUPLICATE = "That sentence is already in your dataset.";

export default function Step3ReviewDataset() {
  const { state, setField } = useMission();
  const examples = state.labeled_examples;

  const isDuplicate = (sentence: string, exceptIndex?: number) =>
    examples.some((e, i) => i !== exceptIndex && sameSentence(e.sentence, sentence));

  const addExample = (example: TrainingExample): string | null => {
    if (isDuplicate(example.sentence)) return DUPLICATE;
    setField("labeled_examples", [...examples, example]);
    return null;
  };

  const editExample = (index: number, example: TrainingExample): string | null => {
    if (isDuplicate(example.sentence, index)) return DUPLICATE;
    setField(
      "labeled_examples",
      examples.map((e, i) => (i === index ? example : e)),
    );
    return null;
  };

  const deleteExample = (index: number) => {
    setField(
      "labeled_examples",
      examples.filter((_, i) => i !== index),
    );
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">3. Review Your Dataset</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          This is everything your model will learn from: the starter examples plus the ones you
          labeled. Check it before training.
        </p>
      </header>

      <Callout tone="info" title="Why balance matters:">
        <ul className="list-disc space-y-1 pl-5">
          <li>A model learns each command only from the examples it sees for that command.</li>
          <li>If one command has far more examples, the model tends to guess it too often.</li>
          <li>Fix mislabeled rows too. A wrong label teaches the model the wrong thing.</li>
        </ul>
      </Callout>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
          Examples per command ({examples.length} total)
        </h2>
        <IntentCounts examples={examples} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">Add an example</h2>
        <ExampleEditor submitLabel="Add to my dataset" onSubmit={addExample} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">All examples</h2>
        <DatasetTable
          examples={examples}
          onEdit={editExample}
          onDelete={deleteExample}
          isStarter={isStarterExample}
          emptyMessage="Your dataset is empty. Label some sentences in Step 2 or add one above."
        />
      </div>
    </section>
  );
}
