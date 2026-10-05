"use client";

import { useMission } from "@/state/MissionContext";
import Callout from "@/components/ui/Callout";
import { TextAreaField } from "@/components/ui/Fields";

export default function Step1ReadLog() {
  const { state, setField } = useMission();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">1. Read the Mission Log</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Mission Control has sent a <strong>lunar mission log</strong> written in casual
          astronaut language. Your robot only understands simple commands like{" "}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-sm">STRAIGHT 40</code> or{" "}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-sm">TURN LEFT</code>.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <TextAreaField
          label="Mission Log 1 (from Mission Control)"
          value={state.mission_log_1}
          onChange={(v) => setField("mission_log_1", v)}
          rows={8}
        />
        <Callout tone="info" title="Goal for this step">
          <ul className="list-disc space-y-1 pl-5">
            <li>Read the log carefully</li>
            <li>Imagine what the robot should actually do on the floor</li>
            <li>Get ready to pull out the most important words</li>
          </ul>
        </Callout>
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />
      <p className="text-slate-600 dark:text-slate-400">
        Next, you&apos;ll <strong>highlight important words and phrases</strong> that matter to a
        robot: <em>actions</em>, <em>amounts</em>, and <em>places</em>.
      </p>
    </section>
  );
}
