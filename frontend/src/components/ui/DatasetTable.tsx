"use client";

// A table of labeled examples. Edit/delete controls appear only when their
// handlers are passed, so the same table works read-only elsewhere.

import { useState } from "react";
import type { TrainingExample } from "@/lib/nlp/api";
import { formatAmount, INTENT_LABELS } from "@/lib/nlp/intents";
import ExampleEditor from "./ExampleEditor";

const CELL = "px-3 py-2 align-top";

export default function DatasetTable({
  examples,
  onEdit,
  onDelete,
  isStarter,
  emptyMessage = "No examples yet.",
}: {
  examples: readonly TrainingExample[];
  /** Returns an error message to show in the row editor, or null on success. */
  onEdit?: (index: number, example: TrainingExample) => string | null;
  onDelete?: (index: number) => void;
  isStarter?: (example: TrainingExample) => boolean;
  emptyMessage?: string;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasActions = onEdit !== undefined || onDelete !== undefined;
  const columns = hasActions ? 4 : 3;

  if (examples.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className={CELL}>Sentence</th>
            <th className={CELL}>Intent</th>
            <th className={CELL}>Amount</th>
            {hasActions ? (
              <th className={CELL}>
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
          {examples.map((ex, index) =>
            onEdit && editingIndex === index ? (
              <tr key={`edit-${index}`}>
                <td colSpan={columns} className="p-3">
                  <ExampleEditor
                    initial={ex}
                    submitLabel="Save"
                    onSubmit={(updated) => {
                      const error = onEdit(index, updated);
                      if (error === null) setEditingIndex(null);
                      return error;
                    }}
                    onCancel={() => setEditingIndex(null)}
                  />
                </td>
              </tr>
            ) : (
              <tr key={`${index}-${ex.sentence}`}>
                <td className={`${CELL} text-slate-800 dark:text-slate-200`}>
                  {ex.sentence}
                  {isStarter?.(ex) ? (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      starter
                    </span>
                  ) : null}
                </td>
                <td className={`${CELL} whitespace-nowrap font-mono text-xs font-semibold text-slate-700 dark:text-slate-300`}>
                  {INTENT_LABELS[ex.intent]}
                </td>
                <td className={`${CELL} whitespace-nowrap font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300`}>
                  {formatAmount(ex)}
                </td>
                {hasActions ? (
                  <td className={`${CELL} whitespace-nowrap text-right`}>
                    {onEdit ? (
                      <button
                        type="button"
                        onClick={() => setEditingIndex(index)}
                        className="rounded px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Indexes shift after a delete, so close any open editor.
                          setEditingIndex(null);
                          onDelete(index);
                        }}
                        className="rounded px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-slate-800"
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
