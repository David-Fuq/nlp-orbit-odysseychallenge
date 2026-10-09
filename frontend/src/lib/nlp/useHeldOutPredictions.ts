"use client";

// The current model's predictions on the held-out test log, shared by Step 5
// (test & iterate) and Step 6 (compare with an LLM).
//
// Predictions are re-fetched once per mount and on every `refresh()` (Step 5
// calls it after a completed retrain): the stored ones may come from a model
// the student has since retrained in Step 4, or one the backend no longer has.
// Every predict call takes a request number, and only the latest request may
// write its result.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useMission } from "@/state/MissionContext";
import { getModelStatus, NotTrainedError, predict, type Prediction } from "./api";
import { HELD_OUT_EXAMPLES } from "./heldOutTestLog";
import { sameSentence } from "./intents";

const SENTENCES = HELD_OUT_EXAMPLES.map((e) => e.sentence);

// loading: a status check or predict call is in flight (also the initial state,
// so the mount effect never has to set state synchronously).
// ready: this mount's latest predict call succeeded, so the stored predictions
// are from the model the backend holds now.
export type HeldOutPhase = "loading" | "ready" | "needs-training" | "unreachable";

/** The stored predictions, if they line up one-to-one with the held-out log. */
function alignedPredictions(stored: readonly Prediction[]): readonly Prediction[] | null {
  if (stored.length !== HELD_OUT_EXAMPLES.length) return null;
  const aligned = stored.every((p, i) => sameSentence(p.sentence, HELD_OUT_EXAMPLES[i].sentence));
  return aligned ? stored : null;
}

/**
 * `predictions` are the stored ones whenever they align with the log, which
 * includes the previous model's while `phase` is "loading" or "unreachable".
 * Only `phase === "ready"` guarantees they come from the current model.
 */
export function useHeldOutPredictions() {
  const { state, setField } = useMission();
  const jobId = state.job_id;
  const [phase, setPhase] = useState<HeldOutPhase>("loading");

  // Bumped by every predict call and by unmount; a response for an older
  // number is dropped, so a slow request can't overwrite a newer one.
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const refresh = () => {
    if (!jobId) return;
    const requestId = ++requestIdRef.current;
    setPhase("loading");
    predict(jobId, SENTENCES).then(
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

  // Mount check. A trained model goes straight to predict; otherwise ask the
  // backend first, since the flag may only be stale (refresh, missed
  // `completed`), and never call predict just to collect a 404.
  const checkModel = useEffectEvent((id: string, isCancelled: () => boolean) => {
    if (state.model_trained) {
      refresh();
      return;
    }
    getModelStatus(id).then(
      (trained) => {
        if (isCancelled()) return;
        if (trained) {
          setField("model_trained", true);
          refresh();
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

  const predictions = phase === "needs-training" ? null : alignedPredictions(state.predicted_new_commands);

  return { phase, predictions, refresh };
}
