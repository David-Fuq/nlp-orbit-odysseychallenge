"use client";

// Step 5's one-shot final test: one predict call on the final-test log. The
// result is saved only when that call fully succeeds; any failure saves
// nothing, so the student can try again. Once saved, training is locked.

import { useEffect, useRef, useState } from "react";
import { useMission } from "@/state/MissionContext";
import { NotTrainedError, predict } from "./api";
import { buildFinalTestResult } from "./rounds";
import { FINAL_TEST_LOG } from "./testLogs";

// idle: not started, or the last attempt can be retried from scratch.
// running: the predict call is in flight.
export type FinalTestStatus = "idle" | "running" | "needs-training" | "unreachable";

export function useFinalTest() {
  const { state, setField, updateField } = useMission();
  const [status, setStatus] = useState<FinalTestStatus>("idle");

  // Set synchronously on click so a double-click can't send two requests;
  // bumped on unmount so a late response is dropped (and nothing is saved).
  const busyRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      busyRef.current = false;
    },
    [],
  );

  const take = ({ isTraining }: { isTraining: boolean }) => {
    if (busyRef.current || isTraining || !state.job_id || state.final_test !== null) return;
    busyRef.current = true;
    const requestId = ++requestIdRef.current;
    const examplesCount = state.labeled_examples.length;
    setStatus("running");

    predict(
      state.job_id,
      FINAL_TEST_LOG.examples.map((e) => e.sentence),
    ).then(
      (predictions) => {
        if (requestId !== requestIdRef.current) return;
        busyRef.current = false;
        const result = buildFinalTestResult(predictions, examplesCount, new Date());
        if (result === null) {
          // A response that doesn't cover the whole log is treated as a failure.
          setStatus("unreachable");
          return;
        }
        // Never overwrites: the first saved result is the final test.
        updateField("final_test", (prev) => prev ?? result);
        setStatus("idle");
      },
      (err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        busyRef.current = false;
        if (err instanceof NotTrainedError) {
          setField("model_trained", false);
          setStatus("needs-training");
        } else {
          setStatus("unreachable");
        }
      },
    );
  };

  return { status, take };
}
