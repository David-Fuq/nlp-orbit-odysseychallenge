"use client";

import { useMission } from "@/state/MissionContext";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import { TextAreaField } from "@/components/ui/Fields";

export default function Step2ExtractPhrases() {
  const { state, setField } = useMission();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          2. Extract Key Phrases (Tokenization &amp; Info Extraction)
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Computers can&apos;t understand the whole paragraph at once. We first pull out the{" "}
          <strong>important pieces</strong>.
        </p>
      </header>

      <div>
        <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Mission Log 1:</p>
        <CodeBlock text={state.mission_log_1} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <TextAreaField
          label="Action Words"
          caption="Verbs like cruise, advance, pivot…"
          value={state.actions_list}
          onChange={(v) => setField("actions_list", v)}
          rows={4}
        />
        <TextAreaField
          label="Amounts / Numbers"
          caption="How far? How many tiles? Turns like quarter turn…"
          value={state.amounts_list}
          onChange={(v) => setField("amounts_list", v)}
          rows={4}
        />
        <TextAreaField
          label="Landmarks"
          caption="Places like first crater, communications tower…"
          value={state.landmarks_list}
          onChange={(v) => setField("landmarks_list", v)}
          rows={4}
        />
      </div>

      <Callout tone="info" title="This is like tokenization + entity extraction.">
        <ul className="list-disc space-y-1 pl-5">
          <li>You&apos;re picking out words that matter to the robot</li>
          <li>Some words are helpful, others are just fluff</li>
          <li>Real NLP systems do this automatically with algorithms</li>
        </ul>
      </Callout>
    </section>
  );
}
