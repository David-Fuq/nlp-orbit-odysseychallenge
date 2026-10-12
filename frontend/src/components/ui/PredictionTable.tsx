// One test log's predictions marked against its ground truth: Sentence /
// Expected / Model said / Result. Used by Step 5's practice rounds (with a
// per-row action on wrong rows) and its final-test results (read-only).

import type { ReactNode } from "react";
import type { Prediction, TrainingExample } from "@/lib/nlp/api";
import { exampleCommand, isPredictionCorrect } from "@/lib/nlp/grading";

const CELL = "px-3 py-2 align-top";

export default function PredictionTable({
  examples,
  predictions,
  busy = false,
  renderExtra,
}: {
  examples: readonly TrainingExample[];
  /** Aligned to `examples`. */
  predictions: readonly Prediction[];
  /** Dims the table while newer predictions are on their way. */
  busy?: boolean;
  /** Extra content under a row's result, e.g. an action for wrong rows. */
  renderExtra?: (index: number, correct: boolean) => ReactNode;
}) {
  return (
    <div
      className={`overflow-x-auto rounded-lg border border-slate-200 transition-opacity dark:border-slate-700 ${busy ? "opacity-60" : ""}`}
      aria-busy={busy}
    >
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className={CELL}>Sentence</th>
            <th className={CELL}>Expected</th>
            <th className={CELL}>Model said</th>
            <th className={CELL}>Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
          {examples.map((truth, i) => {
            const correct = isPredictionCorrect(truth, predictions[i]);
            return (
              <tr key={truth.sentence}>
                <td className={`${CELL} text-slate-800 dark:text-slate-200`}>{truth.sentence}</td>
                <td className={`${CELL} whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300`}>
                  {exampleCommand(truth)}
                </td>
                <td className={`${CELL} whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300`}>
                  {predictions[i].command}
                </td>
                <td className={`${CELL} space-y-1`}>
                  {correct ? (
                    <span className="whitespace-nowrap font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ Correct
                    </span>
                  ) : (
                    <span className="whitespace-nowrap font-semibold text-rose-700 dark:text-rose-400">✗ Wrong</span>
                  )}
                  {renderExtra?.(i, correct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
