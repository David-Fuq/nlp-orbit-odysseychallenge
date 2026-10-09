"use client";

// One labeling form: a sentence (fixed or editable), an intent, and a distance
// only when the intent takes one. Used to add, edit and correct examples.

import { useState, type FormEvent } from "react";
import type { TrainingExample } from "@/lib/nlp/api";
import { buildExample, intentTakesAmount, type Intent } from "@/lib/nlp/intents";
import IntentPicker from "./IntentPicker";

const INPUT =
  "rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export default function ExampleEditor({
  initial,
  sentence: fixedSentence,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TrainingExample;
  /** When given, the sentence is shown read-only and only the label is chosen. */
  sentence?: string;
  submitLabel: string;
  /** Returns an error message to show, or null on success. */
  onSubmit: (example: TrainingExample) => string | null;
  onCancel?: () => void;
}) {
  const [draftSentence, setDraftSentence] = useState(initial?.sentence ?? "");
  const [intent, setIntent] = useState<Intent | null>(initial?.intent ?? null);
  const [amountText, setAmountText] = useState(
    initial?.amount_cm == null ? "" : String(initial.amount_cm),
  );
  const [error, setError] = useState<string | null>(null);

  const sentence = fixedSentence ?? draftSentence;
  const takesAmount = intent !== null && intentTakesAmount(intent);

  const pickIntent = (next: Intent) => {
    setIntent(next);
    // A turn never carries a distance, so don't keep one around for it.
    if (!intentTakesAmount(next)) setAmountText("");
    setError(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = buildExample(sentence, intent, amountText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const submitError = onSubmit(result.example);
    setError(submitError);
    if (submitError === null && fixedSentence === undefined && initial === undefined) {
      // Fresh "add" form: clear it for the next example.
      setDraftSentence("");
      setIntent(null);
      setAmountText("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fixedSentence !== undefined ? (
        <p className="text-slate-800 dark:text-slate-200">&ldquo;{fixedSentence}&rdquo;</p>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Sentence</span>
          <input
            type="text"
            className={`w-full ${INPUT}`}
            value={draftSentence}
            placeholder="e.g. creep forward 30 centimeters"
            onChange={(e) => setDraftSentence(e.target.value)}
          />
        </label>
      )}

      <IntentPicker value={intent} onChange={pickIntent} />

      {takesAmount ? (
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          Distance:
          <input
            type="number"
            min={1}
            step="any"
            inputMode="decimal"
            aria-label="Distance in centimeters"
            className={`w-24 ${INPUT}`}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
          cm
        </label>
      ) : intent !== null ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Turns rotate a fixed angle, so there&apos;s no distance to enter, even if the sentence
          mentions a number.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
