"use client";

import { useMission } from "@/state/MissionContext";
import { TRAINING_EXAMPLES } from "@/lib/nlp/data";
import Callout from "@/components/ui/Callout";
import { TextAreaField, TextInputField } from "@/components/ui/Fields";

export default function Step4Dictionary() {
  const { state, setField } = useMission();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          4. Build a Tiny Language → Command Dictionary
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Real NLP models learn patterns like <strong>&quot;cruise forward&quot; means MOVE</strong>{" "}
          and <strong>&quot;pivot right&quot; means TURN</strong> from lots of examples. Here,
          you&apos;ll build a small <strong>rule-based dictionary</strong> yourself.
        </p>
      </header>

      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Training Phrases (Examples)</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          You can show these to students as your &quot;training data&quot;.
        </p>
        <ul className="space-y-1">
          {TRAINING_EXAMPLES.map(([phrase, cmd]) => (
            <li key={phrase} className="text-sm text-slate-700 dark:text-slate-300">
              <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">{phrase}</code>
              <span className="mx-2 text-slate-400 dark:text-slate-500">→</span>
              <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">{cmd}</code>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">
          Your Dictionary (Synonyms &amp; Notes)
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInputField
            label="Words that usually mean MOVE (comma-separated):"
            value={state.move_synonyms}
            onChange={(v) => setField("move_synonyms", v)}
          />
          <TextInputField
            label="Words that usually mean LEFT (comma-separated):"
            value={state.left_synonyms}
            onChange={(v) => setField("left_synonyms", v)}
          />
          <TextInputField
            label="Words that usually mean TURN (comma-separated):"
            value={state.turn_synonyms}
            onChange={(v) => setField("turn_synonyms", v)}
          />
          <TextInputField
            label="Words that usually mean RIGHT (comma-separated):"
            value={state.right_synonyms}
            onChange={(v) => setField("right_synonyms", v)}
          />
        </div>
      </div>

      <TextAreaField
        label="Notes on your rules (how to handle half/quarter turns, numbers, etc.):"
        value={state.student_dict_notes}
        onChange={(v) => setField("student_dict_notes", v)}
        rows={5}
      />

      <Callout tone="info" title="NLP connection:">
        <ul className="list-disc space-y-1 pl-5">
          <li>These word lists are like the <strong>parameters</strong> of your model.</li>
          <li>Real models learn them from data instead of you typing them in.</li>
        </ul>
      </Callout>
    </section>
  );
}
