"use client";

import { useMemo, useState } from "react";
import { useMission } from "@/state/MissionContext";
import { comparePaths, parseSynonyms, type CompareResult } from "@/lib/nlp/simulator";
import { NEW_MISSION_LOG, NEW_REFERENCE_COMMANDS, NUMBER_WORD_KEYS } from "@/lib/nlp/data";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import DistanceResult from "@/components/ui/DistanceResult";
import { TextAreaField } from "@/components/ui/Fields";

export default function Step5DecodeNew() {
  const { state, setField } = useMission();
  const [result, setResult] = useState<CompareResult | null>(null);

  // Which stored synonyms / number words appear in the new log?
  const detected = useMemo(() => {
    const lower = NEW_MISSION_LOG.toLowerCase();
    const found = (words: string[]) => words.filter((w) => lower.includes(w));
    return [
      { label: "MOVE words", words: found(parseSynonyms(state.move_synonyms)) },
      { label: "TURN words", words: found(parseSynonyms(state.turn_synonyms)) },
      { label: "LEFT words", words: found(parseSynonyms(state.left_synonyms)) },
      { label: "RIGHT words", words: found(parseSynonyms(state.right_synonyms)) },
      { label: "Number words", words: found(NUMBER_WORD_KEYS) },
    ];
  }, [state.move_synonyms, state.turn_synonyms, state.left_synonyms, state.right_synonyms]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          5. Decode a New Mission Log with Your Rules (Test Set)
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Now we&apos;ll see how well your rules <strong>generalize</strong> to a new message.
        </p>
      </header>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">New Mission Log (Test)</h2>
        <CodeBlock text={NEW_MISSION_LOG} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">
          Assist: What might your rules detect here?
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Words your rules might pick up:
            </p>
            <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {detected.map(({ label, words }) => (
                <li key={label}>
                  <strong>{label}:</strong> {words.length > 0 ? words.join(", ") : "None found"}
                </li>
              ))}
            </ul>
          </div>
          <Callout tone="info" title="Try to decide:">
            <ul className="list-disc space-y-1 pl-5">
              <li>Which sentence is a MOVE?</li>
              <li>Which sentence is a TURN?</li>
              <li>How many tiles? How many degrees?</li>
            </ul>
            <p>Use your dictionary as guidance.</p>
          </Callout>
        </div>
      </div>

      <TextAreaField
        label="Your Commands for New Mission Log"
        caption="Write your commands for the NEW mission log:"
        value={state.student_new_commands}
        onChange={(v) => setField("student_new_commands", v)}
        rows={6}
        placeholder={"MOVE 3\nTURN 90"}
      />

      <details className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
          Teacher / Reference Commands for New Log
        </summary>
        <div className="mt-3">
          <CodeBlock text={NEW_REFERENCE_COMMANDS} />
        </div>
      </details>

      <button
        type="button"
        onClick={() =>
          setResult(comparePaths(state.student_new_commands || "", NEW_REFERENCE_COMMANDS))
        }
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
      >
        Check my path vs reference for NEW log
      </button>

      {result ? (
        <DistanceResult
          result={result}
          messages={{
            success: (d) =>
              `Excellent! Your end position is very close to the reference (distance ≈ ${d} tiles).`,
            info: (d) => `Nice! You're within about ${d} tiles of the reference.`,
            warning: (d) =>
              `Your path is off by about ${d} tiles. Re-check your MOVE/TURN and amounts.`,
          }}
        />
      ) : null}
    </section>
  );
}
