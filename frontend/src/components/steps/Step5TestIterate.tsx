"use client";

// Step 5: run the held-out test log through the student's own trained model,
// mark each prediction against the ground truth, and let them teach it a
// sentence it got wrong and retrain without leaving the step.
//
// Predictions are re-fetched once per mount and after every completed retrain:
// the stored ones may come from a model the student has since retrained in
// Step 4. Every predict call takes a request number, and only the latest
// request may write its result.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import { getModelStatus, NotTrainedError, predict, type Prediction } from "@/lib/nlp/api";
import { API_BASE_URL } from "@/lib/nlp/config";
import {
  AMOUNT_TOLERANCE_CM,
  exampleCommand,
  HELD_OUT_PATH_BANDS,
  isPredictionCorrect,
  planTeach,
} from "@/lib/nlp/grading";
import { HELD_OUT_EXAMPLES, HELD_OUT_MISSION_LOG } from "@/lib/nlp/heldOutTestLog";
import { PRESET_LABELS } from "@/lib/nlp/hyperparams";
import { INTENT_LABELS, sameSentence } from "@/lib/nlp/intents";
import { comparePaths } from "@/lib/nlp/simulator";
import { useTrainingRun } from "@/lib/nlp/useTrainingRun";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import DistanceResult from "@/components/ui/DistanceResult";
import TrainingChart from "@/components/ui/TrainingChart";

const SENTENCES = HELD_OUT_EXAMPLES.map((e) => e.sentence);
const REFERENCE_COMMANDS = HELD_OUT_EXAMPLES.map(exampleCommand).join("\n");

const CARD = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";
const CELL = "px-3 py-2 align-top";
const BUTTON =
  "rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-sky-600";
const SMALL_BUTTON =
  "rounded-md border border-sky-600 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-slate-800";

// loading: a status check or predict call is in flight (also the initial state,
// so the mount effect never has to set state synchronously).
type Phase = "loading" | "ready" | "needs-training" | "unreachable";

/** The stored predictions, if they line up one-to-one with the held-out log. */
function alignedPredictions(stored: readonly Prediction[]): readonly Prediction[] | null {
  if (stored.length !== HELD_OUT_EXAMPLES.length) return null;
  const aligned = stored.every((p, i) => sameSentence(p.sentence, HELD_OUT_EXAMPLES[i].sentence));
  return aligned ? stored : null;
}

export default function Step5TestIterate() {
  const { state, setField } = useMission();
  const jobId = state.job_id;
  const [phase, setPhase] = useState<Phase>("loading");
  const [teachNote, setTeachNote] = useState<{ index: number; text: string } | null>(null);

  // Bumped by every predict call and by unmount; a response for an older
  // number is dropped, so a slow request can't overwrite a newer one.
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const refreshPredictions = (id: string) => {
    const requestId = ++requestIdRef.current;
    setPhase("loading");
    predict(id, SENTENCES).then(
      (predictions) => {
        if (requestId !== requestIdRef.current) return;
        setField("predicted_new_commands", predictions);
        setPhase("ready");
      },
      (err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof NotTrainedError) {
          // The backend lost the model (e.g. it restarted): recoverable, not an error.
          setField("model_trained", false);
          setPhase("needs-training");
        } else {
          // Server unreachable: model_trained is left as it was.
          setPhase("unreachable");
        }
      },
    );
  };

  const { isTraining, error, train } = useTrainingRun({ onCompleted: () => refreshPredictions(jobId) });

  // Mount check. A trained model goes straight to predict; otherwise ask the
  // backend first, since the flag may only be stale (refresh, missed
  // `completed`), and never call predict just to collect a 404.
  const checkModel = useEffectEvent((id: string, isCancelled: () => boolean) => {
    if (state.model_trained) {
      refreshPredictions(id);
      return;
    }
    getModelStatus(id).then(
      (trained) => {
        if (isCancelled()) return;
        if (trained) {
          setField("model_trained", true);
          refreshPredictions(id);
        } else {
          setPhase("needs-training");
        }
      },
      () => {
        if (!isCancelled()) setPhase("unreachable");
      },
    );
  });

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    // Deferred a tick: Strict Mode's simulated unmount clears the timer, so
    // even in development a mount sends one request, not two.
    const timer = setTimeout(() => checkModel(jobId, () => cancelled), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const teach = (index: number) => {
    const truth = HELD_OUT_EXAMPLES[index];
    const result = planTeach(state.labeled_examples, truth);
    if (result.kind === "already") {
      setTeachNote({ index, text: "Already in your dataset with this label. Retrain to use it." });
      return;
    }
    setField("labeled_examples", result.next);
    setTeachNote({
      index,
      text:
        result.kind === "added"
          ? "Added to your dataset. Retrain to see if it helps."
          : `Replaced your earlier label (${exampleCommand(result.previous)}) with this one. Retrain to see if it helps.`,
    });
  };

  const predictions = phase === "needs-training" ? null : alignedPredictions(state.predicted_new_commands);
  const marks = predictions ? HELD_OUT_EXAMPLES.map((truth, i) => isPredictionCorrect(truth, predictions[i])) : [];
  const correctCount = marks.filter(Boolean).length;
  const refreshing = phase === "loading" && predictions !== null;
  const pathResult = predictions
    ? comparePaths(predictions.map((p) => p.command).join("\n"), REFERENCE_COMMANDS)
    : null;
  const retrainDisabled = isTraining || !jobId || phase === "loading";

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">5. Test &amp; Iterate</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your model has never seen this mission log. Running it here shows whether it learned the{" "}
          <strong>meaning</strong> of the commands or just memorized your examples.
        </p>
      </header>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">New Mission Log (Test)</h2>
        <CodeBlock text={HELD_OUT_MISSION_LOG} />
      </div>

      {phase === "needs-training" ? (
        <Callout tone="info" title="Train a model first.">
          <p>
            There&apos;s no trained model for this session yet, so there&apos;s nothing to test.{" "}
            <Link href="/steps/4" className="font-medium underline">
              Go back to Step 4
            </Link>{" "}
            to train one, then come back here.
          </p>
        </Callout>
      ) : null}

      {phase === "unreachable" ? (
        <Callout tone="warning" title="Couldn't run your model">
          <p>
            Couldn&apos;t reach the server at {API_BASE_URL}. Make sure the backend is running, then try
            again.
          </p>
          {predictions ? <p>The predictions below are from your last successful run and may be out of date.</p> : null}
          <button
            type="button"
            onClick={() => refreshPredictions(jobId)}
            disabled={!jobId}
            className="mt-2 font-medium underline disabled:opacity-60"
          >
            Try again
          </button>
        </Callout>
      ) : null}

      {phase === "loading" && predictions === null ? (
        <p className="text-sm text-slate-600 dark:text-slate-400" role="status">
          Running your model on the test log…
        </p>
      ) : null}

      {predictions ? (
        <div className="space-y-3">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold text-slate-800 dark:text-slate-200">
            Your model&apos;s predictions
            <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
              {correctCount} / {HELD_OUT_EXAMPLES.length} correct
            </span>
            {refreshing ? (
              <span
                role="status"
                className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-100"
              >
                Refreshing…
              </span>
            ) : null}
          </h2>

          <div
            className={`overflow-x-auto rounded-lg border border-slate-200 transition-opacity dark:border-slate-700 ${refreshing ? "opacity-60" : ""}`}
            aria-busy={refreshing}
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className={CELL}>Sentence</th>
                  <th className={CELL}>Expected</th>
                  <th className={CELL}>Model said</th>
                  <th className={CELL}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                {HELD_OUT_EXAMPLES.map((truth, i) => {
                  const correct = marks[i];
                  const inDataset = state.labeled_examples.some((e) => sameSentence(e.sentence, truth.sentence));
                  return (
                    <tr key={truth.sentence}>
                      <td className={`${CELL} text-slate-800 dark:text-slate-200`}>{truth.sentence}</td>
                      <td className={`${CELL} whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300`}>
                        {exampleCommand(truth)}
                      </td>
                      <td className={`${CELL} whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300`}>
                        {predictions[i].command}
                      </td>
                      <td className={`${CELL} space-y-1`}>
                        {correct ? (
                          <span className="whitespace-nowrap font-semibold text-emerald-700 dark:text-emerald-400">
                            ✓ Correct
                          </span>
                        ) : (
                          <span className="whitespace-nowrap font-semibold text-rose-700 dark:text-rose-400">✗ Wrong</span>
                        )}
                        {inDataset ? (
                          <span className="block text-xs text-slate-500 dark:text-slate-400">In your dataset</span>
                        ) : null}
                        {!correct ? (
                          <button
                            type="button"
                            onClick={() => teach(i)}
                            disabled={isTraining}
                            title={`Add "${truth.sentence}" as ${INTENT_LABELS[truth.intent]} to your dataset`}
                            className={`${SMALL_BUTTON} block whitespace-nowrap`}
                          >
                            Teach it this one
                          </button>
                        ) : null}
                        {teachNote?.index === i ? (
                          <span className="block text-xs text-slate-600 dark:text-slate-400" role="status">
                            {teachNote.text}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            A prediction counts as correct when the command matches and, for STRAIGHT and BACKWARDS, the
            distance is within {AMOUNT_TOLERANCE_CM} cm. A sentence you teach is no longer truly held out:
            the model has seen it, so getting it right afterwards shows memorization, not generalization.
          </p>
        </div>
      ) : null}

      {phase !== "needs-training" ? (
        <div className={`${CARD} space-y-4`}>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Retrain</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Trains a fresh model on your <strong>{state.labeled_examples.length}</strong> examples with{" "}
              <strong>{state.epochs}</strong> epochs and the{" "}
              <strong>{PRESET_LABELS[state.learning_rate_preset].title}</strong> learning rate (
              <Link href="/steps/4" className="font-medium text-sky-700 underline dark:text-sky-400">
                change these in Step 4
              </Link>
              ), then tests it on this log again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTeachNote(null);
              train();
            }}
            disabled={retrainDisabled}
            aria-busy={isTraining}
            className={BUTTON}
          >
            {isTraining ? "Training…" : "Retrain"}
          </button>
          {error ? (
            <Callout tone="warning" title="Retraining didn't finish">
              <p>{error.text}</p>
              {error.serverFailed && state.model_trained ? <p>Your previously trained model is still in place.</p> : null}
            </Callout>
          ) : null}
          <TrainingChart history={state.training_history} />
        </div>
      ) : null}

      {pathResult ? (
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Where does the robot end up?</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your model&apos;s commands and the reference commands, each driven from the same start. The
            distance is between the two end points.
          </p>
          <DistanceResult
            result={pathResult}
            bands={HELD_OUT_PATH_BANDS}
            messages={{
              success: (d) => `Excellent! Your model's path ends ${d} cm from the reference.`,
              info: (d) => `Close: ${d} cm from the reference. The route is right, but an amount is a bit off.`,
              warning: (d) =>
                `Your model's path ends ${d} cm from the reference. A wrong turn or a big distance miss sends the robot somewhere else.`,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
