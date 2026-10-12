"use client";

// "Start over" with a two-step inline confirmation (no window.confirm): resets
// the whole session to a fresh one with a new job_id, then goes to Step 1.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMission } from "@/state/MissionContext";

const DANGER =
  "rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700";
const OUTLINE =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export default function StartOverButton() {
  const { startOver } = useMission();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={OUTLINE}>
        Start over
      </button>
    );
  }

  return (
    <div className="space-y-2" role="group" aria-label="Confirm start over">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        This clears your whole session: your dataset, your trained model, your practice rounds, your final
        test and your LLM answer. You&apos;ll begin again at Step 1.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            startOver();
            router.push("/steps/1");
          }}
          className={DANGER}
        >
          Yes, start over
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={OUTLINE}>
          Cancel
        </button>
      </div>
    </div>
  );
}
