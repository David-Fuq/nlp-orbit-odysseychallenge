"use client";

// One training run's lifecycle, shared by Step 4 (train) and Step 5 (retrain).
// Socket lifecycle lives in refs and callbacks, never in render.
//
// model_trained means "the backend holds a model for this job_id", the same
// question GET /api/model answers. So a new run does NOT reset it: the backend
// keeps the previous model until the new run completes, and keeps it if the
// run fails. Only `completed` (here) and a step's mount-time status check
// change it.

import { useEffect, useRef, useState } from "react";
import { useMission } from "@/state/MissionContext";
import { connectTrainingSocket, startTraining, type TrainingMessage } from "./api";
import { API_BASE_URL } from "./config";
import { LEARNING_RATE_PRESETS } from "./hyperparams";
import { missingIntents } from "./intents";
import { canStartTraining, datasetKey } from "./rounds";

export const UNREACHABLE = `Couldn't reach the training server at ${API_BASE_URL}. Make sure the backend is running, then try again.`;

/** serverFailed: the backend reported `failed`, so it kept any previous model. */
export interface TrainingRunError {
  text: string;
  serverFailed: boolean;
}

/**
 * Trains on the current dataset with the stored epochs and learning-rate
 * preset. `onCompleted` runs after `model_trained` is set by a `completed`
 * message from the latest run. `missingIntents` lists intents the dataset has
 * no examples of; `train` does nothing while it's non-empty, and the step
 * explains why. `locked` means the final test was taken: `train` refuses to
 * start for the rest of the session.
 */
export function useTrainingRun({ onCompleted }: { onCompleted?: () => void } = {}) {
  const { state, setField, updateField } = useMission();
  const jobId = state.job_id;
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<TrainingRunError | null>(null);

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

  const finishRun = (runId: number) => {
    if (runId !== runIdRef.current) return;
    disconnectRef.current?.();
    disconnectRef.current = null;
    busyRef.current = false;
    setIsTraining(false);
  };

  const handleMessage = (runId: number, corpusKey: string, msg: TrainingMessage) => {
    if (runId !== runIdRef.current) return;
    switch (msg.type) {
      case "metrics":
        // Functional update: metrics arrive milliseconds apart, faster than
        // re-renders, so appending to a captured array would drop epochs.
        updateField("training_history", (prev) => [...prev, msg.metrics]);
        break;
      case "completed":
        // Only now: a failed run leaves the backend's previous model, whose
        // dataset key is still the stored one.
        setField("trained_dataset_key", corpusKey);
        // null when the backend sent none, so stats never describe an older model.
        setField("last_training_stats", msg.stats ?? null);
        setField("model_trained", true);
        finishRun(runId);
        onCompleted?.();
        break;
      case "failed":
        setError({ text: msg.message, serverFailed: true });
        finishRun(runId);
        break;
    }
  };

  // The socket dropped mid-run (e.g. the backend stopped). No outcome will
  // arrive, so end the run as unreachable. model_trained is left alone: the
  // next mount-time status check re-asks the backend.
  const handleLost = (runId: number) => {
    if (runId !== runIdRef.current) return;
    setError({ text: UNREACHABLE, serverFailed: false });
    finishRun(runId);
  };

  const missing = missingIntents(state.labeled_examples);
  const locked = state.final_test !== null;

  const train = async () => {
    // The guard of record for the final-test lock; disabled buttons only mirror it.
    if (
      !canStartTraining({ busy: busyRef.current, jobId, missingIntents: missing, finalTest: state.final_test })
    ) {
      return;
    }
    busyRef.current = true;
    const runId = ++runIdRef.current;
    setIsTraining(true);
    setError(null);

    const corpus = state.labeled_examples;
    const corpusKey = datasetKey(corpus);
    const learningRate = LEARNING_RATE_PRESETS[state.learning_rate_preset];

    let disconnect: () => void;
    try {
      // Awaited on purpose: the socket must be open before the POST, or a run
      // that finishes in milliseconds is over before we're listening.
      disconnect = await connectTrainingSocket(
        jobId,
        (msg) => handleMessage(runId, corpusKey, msg),
        () => handleLost(runId),
      );
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

  /**
   * The latest run's id. Call it from callbacks only, never during render: a
   * mount-time status check captures it, then ignores its own result if a
   * run started meanwhile, since that run reports its own outcome.
   */
  const currentRunId = () => runIdRef.current;

  return { isTraining, error, train, currentRunId, missingIntents: missing, locked };
}
