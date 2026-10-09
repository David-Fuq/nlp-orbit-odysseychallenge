// Per-intent example counts as small bars, so an imbalanced dataset is
// obvious at a glance.

import type { TrainingExample } from "@/lib/nlp/api";
import { countByIntent, INTENT_LABELS, INTENTS } from "@/lib/nlp/intents";
import Callout from "./Callout";

export default function IntentCounts({ examples }: { examples: readonly TrainingExample[] }) {
  const counts = countByIntent(examples);
  const values = INTENTS.map((i) => counts[i]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const imbalanced = examples.length > 0 && (min === 0 || max >= 2 * min);

  return (
    <div className="space-y-3">
      <dl
        aria-label="Examples per command"
        className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      >
        {INTENTS.map((intent) => (
          <div key={intent} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3">
            <dt className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
              {INTENT_LABELS[intent]}
            </dt>
            <div aria-hidden className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-2.5 rounded-full bg-sky-600"
                style={{ width: max > 0 ? `${(counts[intent] / max) * 100}%` : "0%" }}
              />
            </div>
            <dd
              data-intent={intent}
              className="text-right font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100"
            >
              {counts[intent]}
            </dd>
          </div>
        ))}
      </dl>
      {imbalanced ? (
        <Callout tone="warning" title="Your dataset is unbalanced.">
          <p>
            {min === 0
              ? "At least one command has no examples, so the model can't learn to recognise it."
              : "Some commands have at least twice as many examples as others."}{" "}
            A model sees the common commands far more often and tends to guess them. Add examples
            for the smaller ones.
          </p>
        </Callout>
      ) : null}
    </div>
  );
}
