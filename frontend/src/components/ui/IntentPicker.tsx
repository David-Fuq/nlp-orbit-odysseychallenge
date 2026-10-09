// The five-button intent chooser used wherever a sentence gets labeled.

import { INTENT_LABELS, INTENTS, type Intent } from "@/lib/nlp/intents";

const BASE =
  "rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const SELECTED = "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-600";
const UNSELECTED =
  "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-600 dark:hover:bg-slate-800";

export default function IntentPicker({
  value,
  onChange,
  label = "What does it mean?",
}: {
  value: Intent | null;
  onChange: (intent: Intent) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {INTENTS.map((intent) => {
        const selected = intent === value;
        return (
          <button
            key={intent}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(intent)}
            className={`${BASE} ${selected ? SELECTED : UNSELECTED}`}
          >
            {INTENT_LABELS[intent]}
          </button>
        );
      })}
    </div>
  );
}
