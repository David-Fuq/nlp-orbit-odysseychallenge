"use client";

// Step 4: pick epochs + a learning-rate preset, train the real model, and plot
// the run. The run itself (socket, POST, metrics, model_trained) lives in
// useTrainingRun, shared with Step 5's retrain; see there for the semantics.

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import { getModelStatus } from "@/lib/nlp/api";
import { EPOCHS_MAX, EPOCHS_MIN, LEARNING_RATE_PRESET_KEYS, PRESET_LABELS } from "@/lib/nlp/hyperparams";
import { useTrainingRun } from "@/lib/nlp/useTrainingRun";
import Callout from "@/components/ui/Callout";
import TrainingChart from "@/components/ui/TrainingChart";

const CARD = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";
const PRESET_BASE =
  "rounded-md border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60";
const PRESET_SELECTED = "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-600";
const PRESET_UNSELECTED =
  "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-600 dark:hover:bg-slate-800";

export default function Step4Train() {
  const { state, setField } = useMission();
  const jobId = state.job_id;
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const { isTraining, error, train, currentRunId } = useTrainingRun({
    onCompleted: () => setStatusNote(null),
  });

  // Mount recovery: once job_id is known, ask the backend whether it holds a
  // model, whatever model_trained says. Covers a missed `completed` and a
  // restarted backend (which forgets every model). A run started meanwhile
  // reports its own outcome, so its result wins over this one.
  const applyModelStatus = useEffectEvent((trained: boolean, runAtStart: number) => {
    if (currentRunId() !== runAtStart) return;
    setField("model_trained", trained);
    setStatusNote(null);
  });
  const runIdNow = useEffectEvent(() => currentRunId());
  const reportStatusUnavailable = useEffectEvent(() => {
    setStatusNote(
      "Couldn't check the training server for your model, so the status below may be out of date.",
    );
  });

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const runAtStart = runIdNow();
    getModelStatus(jobId).then(
      (trained) => {
        if (!cancelled) applyModelStatus(trained, runAtStart);
      },
      () => {
        if (!cancelled) reportStatusUnavailable();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const history = state.training_history;
  const examples = state.labeled_examples;
  const disabled = isTraining || !jobId;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">4. Train Your Model</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Time to turn your labeled examples into a real model. Training shows the model your
          dataset over and over, nudging its numbers a little each time so its guesses get closer
          to your labels.
        </p>
      </header>

      <Callout tone="info" title="Two knobs to try:">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Epochs</strong>: how many times the model studies the whole dataset. Too few
            and it hasn&apos;t learned yet.
          </li>
          <li>
            <strong>Learning rate</strong>: how big each nudge is. Small nudges are slow but steady;
            huge nudges can overshoot and never settle.
          </li>
        </ul>
      </Callout>

      <p className="text-sm text-slate-700 dark:text-slate-300">
        Training on <strong>{examples.length}</strong> labeled examples from your dataset.{" "}
        {examples.length === 0
          ? "Your dataset is empty, so the server will fall back to its own default examples. "
          : null}
        <Link href="/steps/3" className="font-medium text-sky-700 underline dark:text-sky-400">
          Review them in Step 3
        </Link>
        .
      </p>

      <div className={`${CARD} space-y-6`}>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-sm font-semibold text-slate-800 dark:text-slate-200">
            Epochs
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{state.epochs}</span>
          </span>
          <input
            type="range"
            min={EPOCHS_MIN}
            max={EPOCHS_MAX}
            step={1}
            value={state.epochs}
            disabled={isTraining}
            onChange={(e) => setField("epochs", Number(e.target.value))}
            className="w-full accent-sky-600 disabled:opacity-60"
          />
          <span className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{EPOCHS_MIN}</span>
            <span>{EPOCHS_MAX}</span>
          </span>
        </label>

        <div>
          <p id="lr-label" className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Learning rate
          </p>
          <div role="group" aria-labelledby="lr-label" className="grid gap-2 sm:grid-cols-3">
            {LEARNING_RATE_PRESET_KEYS.map((preset) => {
              const selected = preset === state.learning_rate_preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  disabled={isTraining}
                  onClick={() => setField("learning_rate_preset", preset)}
                  className={`${PRESET_BASE} ${selected ? PRESET_SELECTED : PRESET_UNSELECTED}`}
                >
                  <span className="block text-sm font-semibold">{PRESET_LABELS[preset].title}</span>
                  <span className={`block text-xs ${selected ? "text-sky-50" : "text-slate-500 dark:text-slate-400"}`}>
                    {PRESET_LABELS[preset].hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={train}
          disabled={disabled}
          aria-busy={isTraining}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-sky-600"
        >
          {isTraining ? "Training…" : history.length > 0 ? "Train again" : "Train"}
        </button>
      </div>

      {error ? (
        <Callout tone="warning" title="Training didn't finish">
          <p>{error.text}</p>
          {error.serverFailed && state.model_trained ? <p>Your previously trained model is still in place.</p> : null}
        </Callout>
      ) : null}

      {statusNote ? (
        <Callout tone="info">
          <p>{statusNote}</p>
        </Callout>
      ) : null}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
          Training curves
          {history.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({history.length} epochs)
            </span>
          ) : null}
        </h2>
        <TrainingChart history={history} />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Lower loss and higher accuracy are better. This model is tiny, so the whole run can
          appear at once.
        </p>
      </div>

      {!isTraining && state.model_trained ? (
        <Callout tone="success" title="Your model is trained.">
          <p>
            Try another learning rate to compare the curves, or{" "}
            <Link href="/steps/5" className="font-medium underline">
              test it on a new mission log in Step 5
            </Link>
            .
          </p>
        </Callout>
      ) : null}
    </section>
  );
}
