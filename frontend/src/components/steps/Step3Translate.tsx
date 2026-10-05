"use client";

import { useMemo, useState } from "react";
import { useMission } from "@/state/MissionContext";
import { comparePaths, type CompareResult } from "@/lib/nlp/simulator";
import { REFERENCE_COMMANDS } from "@/lib/nlp/data";
import CodeBlock from "@/components/ui/CodeBlock";
import DistanceResult from "@/components/ui/DistanceResult";
import { TextAreaField } from "@/components/ui/Fields";

export default function Step3Translate() {
  const { state, setField } = useMission();
  const [result, setResult] = useState<CompareResult | null>(null);

  // Naive sentence split of the current mission log (matches the prototype).
  const sentences = useMemo(
    () =>
      state.mission_log_1
        .replace(/\n/g, " ")
        .split(".")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [state.mission_log_1],
  );

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          3. Translate Sentences into Robot Commands
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Now we&apos;ll turn each sentence into simple commands our robot understands.
        </p>
      </header>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">Mission Log 1 Sentences</h2>
        <ol className="space-y-1">
          {sentences.map((s, i) => (
            <li key={i} className="text-slate-700 dark:text-slate-300">
              <span className="font-semibold">Sentence {i + 1}:</span> {s}
            </li>
          ))}
        </ol>
      </div>

      <TextAreaField
        label="Your Command List"
        caption="Write each command on its own line, e.g. STRAIGHT 40 or TURN RIGHT"
        value={state.student_commands_1}
        onChange={(v) => setField("student_commands_1", v)}
        rows={6}
        placeholder={REFERENCE_COMMANDS.trim()}
      />

      <details className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
          Teacher / Reference Commands (hidden from students by default)
        </summary>
        <div className="mt-3">
          <CodeBlock text={REFERENCE_COMMANDS} />
        </div>
      </details>

      <button
        type="button"
        onClick={() => setResult(comparePaths(state.student_commands_1 || "", REFERENCE_COMMANDS))}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
      >
        Check how close my path is to the reference
      </button>

      {result ? (
        <DistanceResult
          result={result}
          messages={{
            success: (d) =>
              `Great job! Your end position is very close to the reference (distance ≈ ${d} tiles).`,
            info: (d) => `Pretty good! You're within about ${d} tiles of the reference.`,
            warning: (d) =>
              `Your path is off by about ${d} tiles. Try adjusting your commands.`,
          }}
        />
      ) : null}
    </section>
  );
}
