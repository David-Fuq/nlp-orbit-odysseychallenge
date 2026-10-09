"use client";

// Step 6: the held-out test log from Step 5, decoded by the student's model and
// by an external LLM, each graded against the same reference path.
//
// The model's commands are re-fetched on mount (useHeldOutPredictions) and only
// shown or graded once that request succeeds, so a list from an older model,
// or one the backend no longer has, is never compared.

import { useState } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import { API_BASE_URL } from "@/lib/nlp/config";
import { buildLlmPrompt } from "@/lib/nlp/data";
import { HELD_OUT_PATH_BANDS } from "@/lib/nlp/grading";
import { HELD_OUT_MISSION_LOG, HELD_OUT_REFERENCE_COMMANDS } from "@/lib/nlp/heldOutTestLog";
import { comparePaths } from "@/lib/nlp/simulator";
import { useHeldOutPredictions } from "@/lib/nlp/useHeldOutPredictions";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import DistanceResult, { type BandMessages } from "@/components/ui/DistanceResult";
import { TextAreaField } from "@/components/ui/Fields";

const LLM_PROMPT = buildLlmPrompt(HELD_OUT_MISSION_LOG);

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
  const { state, setField } = useMission();
  const { phase, predictions, refresh } = useHeldOutPredictions();
  // The LLM answer as it was when Compare was clicked; null until then.
  const [comparedLlm, setComparedLlm] = useState<string | null>(null);

  // Only this mount's own successful predict call counts: in any other phase
  // the stored list may be from a different model.
  const modelCommands = phase === "ready" && predictions ? predictions.map((p) => p.command).join("\n") : null;
  const llmCommands = state.llm_commands_held_out;
  const canCompare = llmCommands.trim() !== "" || modelCommands !== null;

  const compared = comparedLlm !== null;
  const modelResult = compared && modelCommands !== null ? comparePaths(modelCommands, HELD_OUT_REFERENCE_COMMANDS) : null;
  const llmResult = comparedLlm?.trim() ? comparePaths(comparedLlm, HELD_OUT_REFERENCE_COMMANDS) : null;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">6. Compare Your Model with an LLM</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your model decoded the <strong>test mission log</strong> from Step 5. Now give the same log to a{" "}
          <strong>large language model</strong> (for example, a LLaMA or GPT model) and see which one gets the
          robot closer to where it should end up.
        </p>
      </header>

      <div>
        <h2 className={H2}>1. Suggested Prompt to Use with an LLM</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Copy this whole prompt into an LLM and let it generate robot commands. It already includes the test
          mission log.
        </p>
        <CodeBlock text={LLM_PROMPT} />
      </div>

      <div>
        <h2 className={`mb-2 ${H2}`}>2. Your Model&apos;s Commands</h2>
        {phase === "loading" ? (
          <p className={NOTE} role="status">
            Running your model on the test log…
          </p>
        ) : null}
        {phase === "needs-training" ? (
          <Callout tone="info" title="Train a model first.">
            <p>
              There&apos;s no trained model for this session yet, so there are no model commands to compare.{" "}
              <Link href="/steps/4" className="font-medium underline">
                Go back to Step 4
              </Link>{" "}
              to train one, and{" "}
              <Link href="/steps/5" className="font-medium underline">
                Step 5
              </Link>{" "}
              shows how it does sentence by sentence. You can still grade an LLM&apos;s answer below.
            </p>
          </Callout>
        ) : null}
        {phase === "unreachable" ? (
          <Callout tone="warning" title="Couldn't run your model">
            <p>
              Couldn&apos;t reach the server at {API_BASE_URL}. Make sure the backend is running, then try again.
              You can still grade an LLM&apos;s answer below.
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={!state.job_id}
              className="mt-2 font-medium underline disabled:opacity-60"
            >
              Try again
            </button>
          </Callout>
        ) : null}
        {modelCommands !== null ? <CodeBlock text={modelCommands} /> : null}
      </div>

      <div>
        <h2 className={H2}>3. LLM Commands</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          1. Copy the prompt above into an LLM (e.g., LLaMA, GPT). 2. Copy the LLM&apos;s response (the commands)
          and paste it here.
        </p>
        <TextAreaField
          label="Paste LLM-generated commands for the test mission log:"
          value={llmCommands}
          onChange={(v) => setField("llm_commands_held_out", v)}
          rows={7}
        />
      </div>

      <button type="button" onClick={() => setComparedLlm(llmCommands)} disabled={!canCompare} className={BUTTON}>
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
            ) : (
              <p className={`mt-1 ${NOTE}`}>
                {phase === "loading"
                  ? "Your model is still running; its result appears here when it finishes."
                  : "No model commands to grade (see section 2)."}
              </p>
            )}
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
              <CodeBlock text={HELD_OUT_REFERENCE_COMMANDS} />
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
    </section>
  );
}
