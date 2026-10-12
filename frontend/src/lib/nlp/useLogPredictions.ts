"use client";

// The current model's predictions on one practice log, for Step 5's rounds.
//
// Predictions are re-fetched once per mount, whenever the log changes, and on
// every `refresh()` (Step 5 calls it after a completed retrain): the stored
// ones may come from a model the student has since retrained in Step 4, or one
// the backend no longer has. Every predict call takes a request number, and
// only the latest request may write its result.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useMission } from "@/state/MissionContext";
import { getModelStatus, NotTrainedError, predict } from "./api";
import { alignedPredictions, countCorrect } from "./rounds";
import type { TestLog } from "./testLogs";

// loading: a status check or predict call is in flight (also the initial state,
// so the mount effect never has to set state synchronously).
// ready: this mount's latest predict call for this log succeeded, so the
// stored predictions are from the model the backend holds now.
export type LogPhase = "loading" | "ready" | "needs-training" | "unreachable";

/**
 * `predictions` are the stored ones whenever they align with `log`, which
 * includes the previous model's while `phase` is "loading" or "unreachable".
 * Only `phase === "ready"` guarantees they come from the current model.
 * `onResult` runs after every successful predict with that run's score.
 */
export function useLogPredictions(
  log: TestLog,
  { onResult }: { onResult?: (logId: string, correct: number, total: number) => void } = {},
) {
  const { state, setField } = useMission();
  const jobId = state.job_id;
  const logId = log.id;
  // Tagged with the log it describes, so switching logs reads as "loading"
  // without a synchronous setState in the effect.
  const [status, setStatus] = useState<{ logId: string; phase: LogPhase }>({ logId, phase: "loading" });
  const phase: LogPhase = status.logId === logId ? status.phase : "loading";

  // Bumped by every predict call, by a job or log change and by unmount; a
  // response for an older number is dropped, so a slow request can't
  // overwrite a newer one or another log's.
  const requestIdRef = useRef(0);

  const refresh = () => {
    if (!jobId) return;
    const requestId = ++requestIdRef.current;
    const target = log;
    setStatus({ logId: target.id, phase: "loading" });
    predict(
      jobId,
      target.examples.map((e) => e.sentence),
    ).then(
      (predictions) => {
        if (requestId !== requestIdRef.current) return;
        setField("round_predictions", predictions);
        setStatus({ logId: target.id, phase: "ready" });
        onResult?.(target.id, countCorrect(target, predictions), target.examples.length);
      },
      (err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof NotTrainedError) {
          // The backend lost the model (e.g. it restarted): recoverable, not an error.
          setField("model_trained", false);
          setStatus({ logId: target.id, phase: "needs-training" });
        } else {
          // Server unreachable: model_trained is left as it was.
          setStatus({ logId: target.id, phase: "unreachable" });
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
          setStatus({ logId, phase: "needs-training" });
        }
      },
      () => {
        if (!isCancelled()) setStatus({ logId, phase: "unreachable" });
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
      requestIdRef.current += 1;
    };
  }, [jobId, logId]);

  const predictions = phase === "needs-training" ? null : alignedPredictions(log, state.round_predictions);

  return { phase, predictions, refresh };
}
