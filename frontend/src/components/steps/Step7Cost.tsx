"use client";

// Step 7: what did the student's model cost, next to published figures for
// large LLMs. The student's side comes from session state (dataset,
// `last_training_stats` from the backend's `completed.stats`, the final test,
// labeling time); the LLM side only from llmCostFacts.ts, each figure with its
// qualifier and a source link. Honest, not triumphant: the page never calls
// either model "better" (step7Cost.test.ts checks).
//
// Nothing from the final-test log is rendered here, before or after the test:
// only its score and Step 6's path distances (finalTestLeak.test.ts).

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import {
  ASSUMED_LAPTOP_WATTS,
  ASSUMED_PRICE_PER_KWH_USD,
  countOwnExamples,
  countWords,
  electricityCents,
  formatCents,
  formatMinutes,
  formatSeconds,
  labelingMinutes,
  scaleRatios,
  step6Distances,
} from "@/lib/costReceipt";
import { LLM_COST_FACTS, type LlmCostFact } from "@/lib/llmCostFacts";
import Callout from "@/components/ui/Callout";
import ScaleChart from "@/components/ui/ScaleChart";
import StartOverButton from "@/components/ui/StartOverButton";

const H2 = "text-lg font-semibold text-slate-800 dark:text-slate-200";
const NOTE = "text-sm text-slate-600 dark:text-slate-400";
const LINK = "font-medium text-sky-700 underline dark:text-sky-400";
const CARD = "rounded-lg border bg-white p-4 dark:bg-slate-900";

/** "Now", for labeling time that hasn't ended. Read from a timer, never during render. */
function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

function ReceiptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-dashed border-slate-200 py-2 last:border-b-0 sm:flex-row sm:justify-between sm:gap-4 dark:border-slate-700">
      <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</dt>
      <dd className="text-sm text-slate-900 sm:text-right dark:text-slate-100">{children}</dd>
    </div>
  );
}

const EMPTY = <span className="text-slate-500 dark:text-slate-400">—</span>;

function SourceLink({ fact }: { fact: LlmCostFact }) {
  return (
    <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
      {fact.sourceTitle}
    </a>
  );
}

export default function Step7Cost() {
  const { state } = useMission();
  const now = useNow(30_000);

  const examples = state.labeled_examples;
  const own = countOwnExamples(examples);
  const words = countWords(examples);
  const stats = state.last_training_stats;
  const finalTest = state.final_test;
  const ratios = scaleRatios(words, stats);

  const labelingEnd = finalTest ? Date.parse(finalTest.taken_at) : now;
  const minutes = labelingEnd === null ? null : labelingMinutes(state.labeling_started_at, labelingEnd);

  const distances = finalTest ? step6Distances(finalTest, state.llm_commands_held_out) : null;

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">7. What Did It Cost?</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          You just built a language model. What did that take? Below is a receipt for your model, built from your
          own numbers, next to published figures for large language models (LLMs). They&apos;re very different
          tools, so this isn&apos;t a contest. It&apos;s a look at what each one takes to build.
        </p>
      </header>

      <div className="space-y-3">
        <h2 className={H2}>Your model&apos;s receipt</h2>
        {stats === null ? <MissingStatsCallout trained={state.model_trained} locked={finalTest !== null} /> : null}
        <dl
          className={`${CARD} ${stats === null ? "border-dashed border-slate-300 dark:border-slate-600" : "border-slate-200 dark:border-slate-700"}`}
        >
          <ReceiptRow label="Examples in your dataset">
            {examples.length} examples: {own} written or edited by you, {examples.length - own} starter examples
          </ReceiptRow>
          <ReceiptRow label="Words in your dataset">{words.toLocaleString("en-US")} words</ReceiptRow>
          <ReceiptRow label="Model size">
            {stats
              ? `${stats.parameters.toLocaleString("en-US")} parameters (the numbers your model adjusted while it learned)`
              : EMPTY}
          </ReceiptRow>
          <ReceiptRow label="Training time">
            {stats
              ? `${formatSeconds(stats.training_seconds)} seconds on the training server's CPU (${stats.epochs} epochs on ${stats.examples} examples)`
              : EMPTY}
          </ReceiptRow>
          <ReceiptRow label="Electricity for training">
            {stats ? formatCents(electricityCents(stats.training_seconds)) : EMPTY}
          </ReceiptRow>
          <ReceiptRow label="Final-test score">
            {finalTest ? (
              `${finalTest.correct} of ${finalTest.total} sentences correct`
            ) : (
              <>
                {EMPTY} Not taken yet. It&apos;s at the end of{" "}
                <Link href="/steps/5" className={LINK}>
                  Step 5
                </Link>
                .
              </>
            )}
          </ReceiptRow>
          <ReceiptRow label="Time spent labeling">
            {state.labeling_started_at === null ? (
              <>{EMPTY} Not recorded. It starts the first time you open Step 2.</>
            ) : minutes === null ? (
              EMPTY
            ) : (
              `${formatMinutes(minutes)}, from when you first opened Step 2 until ${finalTest ? "your final test" : "now"}`
            )}
          </ReceiptRow>
        </dl>
        <p className={NOTE}>
          Electricity is estimated from the training time, assuming a {ASSUMED_LAPTOP_WATTS} W laptop and $
          {ASSUMED_PRICE_PER_KWH_USD.toFixed(2)} per kWh. It doesn&apos;t include the computer itself or your time.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className={H2}>A large LLM&apos;s receipt</h2>
        <p className={NOTE}>
          Published figures for some large models. Meta publishes the most detail about how its Llama models were
          built, so most rows are about Llama 3.1, its 2024 model family.
        </p>
        <ul className={`${CARD} space-y-3 border-slate-200 dark:border-slate-700`}>
          {LLM_COST_FACTS.map((fact) => (
            <li key={fact.id} className="text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                <span className="font-medium">
                  {fact.label} ({fact.model}):
                </span>{" "}
                <span className="text-slate-900 dark:text-slate-100">{fact.text}</span>,{" "}
                <em>{fact.qualifier}</em>.
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Source: <SourceLink fact={fact} />
              </p>
            </li>
          ))}
        </ul>
        <p className={NOTE}>A GPU hour is one graphics processor (GPU) running for one hour.</p>
        <Callout tone="warning" title="Compute only: the real total is higher.">
          <p>
            The dollar figures estimate only the computing cost of training. They leave out salaries, data,
            experiments and failed runs, so the real total is higher.
          </p>
        </Callout>
      </div>

      <div className="space-y-3">
        <h2 className={H2}>How big is the gap?</h2>
        <p className={NOTE}>Each bar shows how many times larger the LLM&apos;s number is than yours.</p>
        <ScaleChart
          rows={[
            {
              label: "Training text: Llama 3.1's tokens ÷ your words",
              ratio: ratios.text,
              note: "Approximate: LLMs count tokens (words and pieces of words), your dataset counts whole words.",
              emptyText: "Your dataset is empty, so there's nothing to compare.",
            },
            {
              label: "Model size: Llama 3.1 405B's parameters ÷ yours",
              ratio: ratios.size,
              emptyText: "Train your model in Step 4 to see this one.",
            },
            {
              label: "Training time: the 405B model's GPU hours ÷ your CPU seconds",
              ratio: ratios.time,
              note: "Approximate: this compares time only. A GPU hour and a CPU second aren't the same amount of work.",
              emptyText: "Train your model in Step 4 to see this one.",
            },
          ]}
        />
      </div>

      <div className="space-y-3">
        <h2 className={H2}>When is each the right tool?</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`${CARD} border-slate-200 dark:border-slate-700`}>
            <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-200">Your model</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              <li>
                <strong>Cheap:</strong> training used less than a cent of electricity.
              </li>
              <li>
                <strong>Fast:</strong> it trained in seconds and answers instantly.
              </li>
              <li>
                <strong>Private and offline:</strong> it runs on one computer, and your sentences never leave it.
              </li>
              <li>
                <strong>Predictable:</strong> it always answers with one of the five commands.
              </li>
              <li>
                <strong>Yours:</strong> you chose every example it learned from.
              </li>
              <li>
                <strong>But:</strong> it knows only these five commands, and it stumbles on phrasings unlike your
                examples.
              </li>
            </ul>
          </div>
          <div className={`${CARD} border-slate-200 dark:border-slate-700`}>
            <h3 className="mb-2 font-semibold text-slate-800 dark:text-slate-200">A large LLM</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              <li>
                <strong>Flexible:</strong> it handles almost any phrasing, and many tasks besides robot commands.
              </li>
              <li>
                <strong>Ready to use:</strong> you didn&apos;t have to label anything.
              </li>
              <li>
                <strong>But:</strong> it&apos;s enormously expensive to build, it runs on someone else&apos;s servers
                (so it needs the internet), and it&apos;s harder to control. It can answer in a format the robot
                can&apos;t read, or differently each time.
              </li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {distances === null ? (
            <>
              Take the final test and compare with an LLM in{" "}
              <Link href="/steps/6" className={LINK}>
                Step 6
              </Link>{" "}
              to see your own results here.
            </>
          ) : distances.llm === null ? (
            <>
              In Step 6, your model&apos;s path ended {distances.model.toFixed(2)} cm from the reference. You
              haven&apos;t pasted an LLM answer in{" "}
              <Link href="/steps/6" className={LINK}>
                Step 6
              </Link>{" "}
              yet.
            </>
          ) : (
            <>
              In Step 6, your model&apos;s path ended {distances.model.toFixed(2)} cm from the reference, and the
              LLM&apos;s ended {distances.llm.toFixed(2)} cm away.
            </>
          )}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Neither one is simply better. The right choice depends on the job, the budget and where the model has to
          run.
        </p>
      </div>

      <Callout tone="info" title="Questions to think about:">
        <ul className="list-disc space-y-1 pl-5">
          <li>Which one would you put on a real robot with no internet?</li>
          <li>What would it take to make your model handle new phrasings as well as the LLM?</li>
          <li>Who pays for the LLM&apos;s cost, and how?</li>
        </ul>
      </Callout>

      <div className="space-y-2">
        <p className={NOTE}>Want to try again with a different dataset?</p>
        <StartOverButton />
      </div>
    </section>
  );
}

function MissingStatsCallout({ trained, locked }: { trained: boolean; locked: boolean }) {
  if (locked) {
    return (
      <Callout tone="info">
        <p>
          This model was trained before training stats were recorded, and training is locked after the final
          test. Start over for a full receipt.
        </p>
      </Callout>
    );
  }
  return (
    <Callout tone="info">
      <p>
        {trained
          ? "These rows fill in after your next training run in "
          : "Your model hasn't been trained yet, so the training rows are empty. Train it in "}
        <Link href="/steps/4" className="font-medium underline">
          Step 4
        </Link>
        {trained ? "." : ", then come back."}
      </p>
    </Callout>
  );
}
