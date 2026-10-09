"use client";

// Step 4: pick epochs + a learning-rate preset, train the real model, and plot
// the run. Socket lifecycle lives in refs and callbacks, never in render.
//
// model_trained means "the backend holds a model for this job_id", the same
// question GET /api/model answers. So a new run does NOT reset it: the backend
// keeps the previous model until the new run completes, and keeps it if the
// run fails. Only `completed` and the mount-time status check change it.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import {
  connectTrainingSocket,
  getModelStatus,
  startTraining,
  type TrainingMessage,
} from "@/lib/nlp/api";
import { API_BASE_URL } from "@/lib/nlp/config";
import {
  EPOCHS_MAX,
  EPOCHS_MIN,
  LEARNING_RATE_PRESET_KEYS,
  LEARNING_RATE_PRESETS,
  PRESET_LABELS,
} from "@/lib/nlp/hyperparams";
import Callout from "@/components/ui/Callout";
import TrainingChart from "@/components/ui/TrainingChart";

const CARD = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";
const PRESET_BASE =
  "rounded-md border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60";
const PRESET_SELECTED = "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-600";
const PRESET_UNSELECTED =
  "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-600 dark:hover:bg-slate-800";

const UNREACHABLE = `Couldn't reach the training server at ${API_BASE_URL}. Make sure the backend is running, then try again.`;

export default function Step4Train() {
  const { state, setField, updateField } = useMission();
  const jobId = state.job_id;
  const [isTraining, setIsTraining] = useState(false);
  // serverFailed: the backend reported `failed`, so it kept any previous model.
  const [error, setError] = useState<{ text: string; serverFailed: boolean } | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Bumped by every new run and by unmount; callbacks from an older run see a
  // different number and do nothing.
  const runIdRef = useRef(0);
  // Set synchronously on click, so a double-click can't start two runs before
  // the disabled button re-renders.
  const busyRef = useRef(false);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      disconnectRef.current?.();
      disconnectRef.current = null;
      busyRef.current = false;
    },
    [],
  );

  // Mount recovery: once job_id is known, ask the backend whether it holds a
  // model, whatever model_trained says. Covers a missed `completed` and a
  // restarted backend (which forgets every model). A run started meanwhile
  // reports its own outcome, so its result wins over this one.
  const applyModelStatus = useEffectEvent((trained: boolean, runAtStart: number) => {
    if (runIdRef.current !== runAtStart) return;
    setField("model_trained", trained);
    setStatusNote(null);
  });
  const reportStatusUnavailable = useEffectEvent(() => {
    setStatusNote(
      "Couldn't check the training server for your model, so the status below may be out of date.",
    );
  });

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const runAtStart = runIdRef.current;
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

  const finishRun = (runId: number) => {
    if (runId !== runIdRef.current) return;
    disconnectRef.current?.();
    disconnectRef.current = null;
    busyRef.current = false;
    setIsTraining(false);
  };

  const handleMessage = (runId: number, msg: TrainingMessage) => {
    if (runId !== runIdRef.current) return;
    switch (msg.type) {
      case "metrics":
        // Functional update: metrics arrive milliseconds apart, faster than
        // re-renders, so appending to a captured array would drop epochs.
        updateField("training_history", (prev) => [...prev, msg.metrics]);
        break;
      case "completed":
        setField("model_trained", true);
        setStatusNote(null);
        finishRun(runId);
        break;
      case "failed":
        setError({ text: msg.message, serverFailed: true });
        finishRun(runId);
        break;
    }
  };

  const train = async () => {
    if (busyRef.current || !jobId) return;
    busyRef.current = true;
    const runId = ++runIdRef.current;
    setIsTraining(true);
    setError(null);

    const corpus = state.labeled_examples;
    const learningRate = LEARNING_RATE_PRESETS[state.learning_rate_preset];

    let disconnect: () => void;
    try {
      // Awaited on purpose: the socket must be open before the POST, or a run
      // that finishes in milliseconds is over before we're listening.
      disconnect = await connectTrainingSocket(jobId, (msg) => handleMessage(runId, msg));
    } catch {
      if (runId === runIdRef.current) setError({ text: UNREACHABLE, serverFailed: false });
      finishRun(runId);
      return;
    }
    if (runId !== runIdRef.current) {
      // Unmounted while connecting.
      disconnect();
      return;
    }
    disconnectRef.current = disconnect;
    // Cleared only now, so an unreachable server keeps the last run's chart.
    // No metrics can arrive before the POST below, so nothing is lost.
    setField("training_history", []);

    try {
      await startTraining(jobId, corpus, state.epochs, learningRate);
    } catch (err) {
      if (runId === runIdRef.current) {
        // fetch rejects with a TypeError when the server can't be reached.
        setError(
          err instanceof TypeError
            ? { text: UNREACHABLE, serverFailed: false }
            : { text: `The server rejected the training request: ${String(err)}`, serverFailed: true },
        );
      }
      finishRun(runId);
    }
  };

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
