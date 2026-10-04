"use client";

import { useState } from "react";
import { useMission } from "@/state/MissionContext";
import { comparePaths, type CompareResult } from "@/lib/nlp/simulator";
import { buildLlmPrompt, NEW_MISSION_LOG, NEW_REFERENCE_COMMANDS } from "@/lib/nlp/data";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import { TextAreaField } from "@/components/ui/Fields";

interface ThreeWay {
  student: CompareResult;
  llm: CompareResult | null;
}

export default function Step6CompareLLM() {
  const { state, setField } = useMission();
  const [comparison, setComparison] = useState<ThreeWay | null>(null);

  const runComparison = () => {
    const student = comparePaths(state.student_new_commands || "", NEW_REFERENCE_COMMANDS);
    const llm = state.llm_commands_new.trim()
      ? comparePaths(state.llm_commands_new, NEW_REFERENCE_COMMANDS)
      : null;
    setComparison({ student, llm });
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          6. Compare Your Commands with an LLM
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Now we compare your decoding of the <strong>NEW mission log</strong> to the output from
          an <strong>actual language model</strong> (for example, a LLaMA or GPT model).
        </p>
      </header>

      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">1. Suggested Prompt to Use with an LLM</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Students can copy this whole prompt, paste it into an LLM, and let it generate robot
          commands. This prompt already includes the NEW mission log.
        </p>
        <CodeBlock text={buildLlmPrompt(NEW_MISSION_LOG)} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">2. Your Commands (New Mission Log)</h2>
        <CodeBlock
          text={state.student_new_commands}
          placeholder="No commands yet – fill them in step 5."
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">3. LLM Commands</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          1. Copy the prompt above into an LLM (e.g., LLaMA, GPT). 2. Copy the LLM&apos;s response
          (the commands) and paste it here.
        </p>
        <TextAreaField
          label="Paste LLM-generated commands for the NEW mission log:"
          value={state.llm_commands_new}
          onChange={(v) => setField("llm_commands_new", v)}
          rows={6}
        />
      </div>

      <button
        type="button"
        onClick={runComparison}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
      >
        Compare all three: You vs LLM vs Reference
      </button>

      {comparison ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Path Comparison</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Your vs Reference</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Distance between end positions:{" "}
                <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">
                  {comparison.student.distance.toFixed(2)}
                </code>{" "}
                tiles
              </p>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              {comparison.llm ? (
                <>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">LLM vs Reference</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Distance between end positions:{" "}
                    <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">
                      {comparison.llm.distance.toFixed(2)}
                    </code>{" "}
                    tiles
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">No LLM commands provided yet.</p>
              )}
            </div>
          </div>

          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Side-by-Side Commands</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Your Commands</p>
              <CodeBlock text={comparison.student.studentList.join("\n")} />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">LLM Commands</p>
              <CodeBlock text={comparison.llm ? comparison.llm.studentList.join("\n") : ""} />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Reference Commands</p>
              <CodeBlock text={comparison.student.refList.join("\n")} />
            </div>
          </div>
        </div>
      ) : null}

      <Callout tone="info" title="Discussion prompts for students:">
        <ul className="list-disc space-y-1 pl-5">
          <li>Where did you and the LLM agree? Where did you differ?</li>
          <li>Did the LLM ever misunderstand a phrase?</li>
          <li>Were your rules too strict or too loose?</li>
        </ul>
        <p>
          This shows that both <strong>humans and AI models</strong> can misinterpret language and
          that clear instructions (prompts) matter.
        </p>
      </Callout>
    </section>
  );
}
