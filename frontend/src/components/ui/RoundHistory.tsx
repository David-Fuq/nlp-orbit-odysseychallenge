// Step 5's practice-round scores, one line per log attempted:
// "Round 1 · Practice log 1: 3/7 first try → 5/7 latest".

import type { RoundResult } from "@/state/missionStorage";
import { PRACTICE_LOGS } from "@/lib/nlp/testLogs";

export default function RoundHistory({ history }: { history: readonly RoundResult[] }) {
  if (history.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">Your practice rounds</h2>
      <ol className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
        {history.map((r, i) => {
          const logNumber = PRACTICE_LOGS.findIndex((l) => l.id === r.log_id) + 1;
          return (
            <li key={r.log_id}>
              <span className="font-medium">
                Round {i + 1} · Practice log {logNumber}:
              </span>{" "}
              <span className="tabular-nums">
                {r.first_correct}/{r.total} first try
                {r.latest_correct !== r.first_correct ? ` → ${r.latest_correct}/${r.total} latest` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
