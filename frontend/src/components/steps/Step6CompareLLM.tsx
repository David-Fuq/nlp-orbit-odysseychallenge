"use client";

// Step 6: the final-test log from Step 5, decoded by the student's model and
// by an external LLM, each graded against the same reference path.
//
// The model's commands are the answers saved when the final test was taken,
// never a live predict call, so this step keeps working after a backend
// restart. Until the final test is taken, nothing from the final-test log is
// rendered (not the log, the prompt that contains it, the reference commands
// or the discussion prompts that quote it); finalTestLeak.test.ts checks this.

import { useState } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import type { FinalTestResult } from "@/state/missionStorage";
import { buildLlmPrompt } from "@/lib/nlp/data";
import { HELD_OUT_PATH_BANDS } from "@/lib/nlp/grading";
import { comparePaths } from "@/lib/nlp/simulator";
import { FINAL_TEST_LOG, referenceCommands } from "@/lib/nlp/testLogs";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import DistanceResult, { type BandMessages } from "@/components/ui/DistanceResult";
import { TextAreaField } from "@/components/ui/Fields";

const BUTTON =
  "rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-sky-600";
const H2 = "text-lg font-semibold text-slate-800 dark:text-slate-200";
const H3 = "text-sm font-semibold text-slate-800 dark:text-slate-200";
const NOTE = "text-sm text-slate-600 dark:text-slate-400";

function bandMessages(who: string): BandMessages {
  return {
    success: (d) => `Excellent! ${who} path ends ${d} cm from the reference.`,
    info: (d) => `Close: ${d} cm from the reference. The route is right, but an amount is a bit off.`,
    warning: (d) =>
      `${who} path ends ${d} cm from the reference. A wrong turn or a big distance miss sends the robot somewhere else.`,
  };
}

const MODEL_MESSAGES = bandMessages("Your model's");
const LLM_MESSAGES = bandMessages("The LLM's");

export default function Step6CompareLLM() {
  const { state } = useMission();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">6. Compare Your Model with an LLM</h1>
        {state.final_test ? (
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Your model took the <strong>final test</strong> in Step 5. Now give the same log to a{" "}
            <strong>large language model</strong> (for example, a LLaMA or GPT model) and see which one gets the
            robot closer to where it should end up.
          </p>
        ) : null}
      </header>

      {state.final_test ? (
        <Comparison finalTest={state.final_test} />
      ) : (
        <Callout tone="info" title="Take the final test first.">
          <p>
            Step 6 compares your model with an LLM on the final-test log, which stays hidden until your model has
            taken the test. Finish your practice rounds and take the final test in Step 5, then come back.
          </p>
          <p>
            <Link href="/steps/5" className="font-medium underline">
              Go to Step 5
            </Link>
          </p>
        </Callout>
      )}

      <p>
        <Link href="/steps/7" className="font-medium text-sky-700 underline dark:text-sky-400">
          Continue to Step 7: what did your model cost? →
        </Link>
      </p>
    </section>
  );
}

function Comparison({ finalTest }: { finalTest: FinalTestResult }) {
  const { state, setField } = useMission();
  // The LLM answer as it was when Compare was clicked; null until then.
  const [comparedLlm, setComparedLlm] = useState<string | null>(null);

  const reference = referenceCommands(FINAL_TEST_LOG);
  const modelCommands = finalTest.predictions.map((p) => p.command).join("\n");
  const llmCommands = state.llm_commands_held_out;

  const compared = comparedLlm !== null;
  const modelResult = compared ? comparePaths(modelCommands, reference) : null;
  const llmResult = comparedLlm?.trim() ? comparePaths(comparedLlm, reference) : null;

  return (
    <>
      <div>
        <h2 className={H2}>1. Suggested Prompt to Use with an LLM</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Copy this whole prompt into an LLM and let it generate robot commands. It already includes the
          final-test mission log.
        </p>
        <CodeBlock text={buildLlmPrompt(FINAL_TEST_LOG.mission_log)} />
      </div>

      <div>
        <h2 className={`mb-2 ${H2}`}>2. Your Model&apos;s Commands</h2>
        <p className={`mb-2 ${NOTE}`}>Saved from your final test.</p>
        <CodeBlock text={modelCommands} />
      </div>

      <div>
        <h2 className={H2}>3. LLM Commands</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          1. Copy the prompt above into an LLM (e.g., LLaMA, GPT). 2. Copy the LLM&apos;s response (the commands)
          and paste it here.
        </p>
        <TextAreaField
          label="Paste LLM-generated commands for the final-test mission log:"
          value={llmCommands}
          onChange={(v) => setField("llm_commands_held_out", v)}
          rows={7}
        />
      </div>

      <button type="button" onClick={() => setComparedLlm(llmCommands)} className={BUTTON}>
        Compare with the reference
      </button>

      {compared ? (
        <div className="space-y-6">
          <h2 className={H2}>Where does the robot end up?</h2>
          <p className={`-mt-4 ${NOTE}`}>
            Each list of commands is driven from the same start as the reference. The distance is between the end
            points.
          </p>

          <div>
            <h3 className={H3}>Your model vs reference</h3>
            {modelResult ? (
              <DistanceResult
                result={modelResult}
                bands={HELD_OUT_PATH_BANDS}
                messages={MODEL_MESSAGES}
                showLists={false}
              />
            ) : null}
          </div>

          <div>
            <h3 className={H3}>LLM vs reference</h3>
            {llmResult ? (
              <DistanceResult result={llmResult} bands={HELD_OUT_PATH_BANDS} messages={LLM_MESSAGES} showLists={false} />
            ) : (
              <p className={`mt-1 ${NOTE}`}>No LLM commands pasted yet.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className={`mb-1 ${H3}`}>Your model&apos;s commands</p>
              <CodeBlock text={modelResult ? modelResult.studentList.join("\n") : ""} />
            </div>
            <div>
              <p className={`mb-1 ${H3}`}>LLM commands</p>
              <CodeBlock text={llmResult ? llmResult.studentList.join("\n") : ""} />
            </div>
            <div>
              <p className={`mb-1 ${H3}`}>Reference commands</p>
              <CodeBlock text={reference} />
            </div>
          </div>
        </div>
      ) : null}

      <Callout tone="info" title="Discussion prompts for students:">
        <ul className="list-disc space-y-1 pl-5">
          <li>Which sentences did your model get wrong? Which did the LLM get wrong? Were they the same ones?</li>
          <li>Did either one misread a phrase like &ldquo;swap ends&rdquo; or &ldquo;backing off the rim&rdquo;?</li>
          <li>
            Your model only knows the examples you gave it. What examples could you add to fix its mistakes?
          </li>
          <li>The LLM learned from a huge amount of text. Why might that help it with unusual phrasings?</li>
        </ul>
        <p>
          Both a small model trained on your examples and a huge <strong>language model</strong> can
          misinterpret language. What a model learns depends on the <strong>data it was trained on</strong>.
        </p>
      </Callout>
    </>
  );
}
