"use client";

// Step 5: practice rounds on logs the model has never seen, with "Add a
// similar example" and retraining in place, ending in a one-shot final test
// that locks training. Once the final test is taken, the step shows its
// results instead.
//
// Practice predictions come from useLogPredictions: re-fetched once per mount,
// whenever the round changes, and after every completed retrain. The final
// test's answers are saved in session state and never re-run.

import { useState } from "react";
import Link from "next/link";
import { useMission } from "@/state/MissionContext";
import type { FinalTestResult, RoundResult } from "@/state/missionStorage";
import type { TrainingExample } from "@/lib/nlp/api";
import { API_BASE_URL } from "@/lib/nlp/config";
import { AMOUNT_TOLERANCE_CM, exampleCommand, HELD_OUT_PATH_BANDS, planTeach } from "@/lib/nlp/grading";
import { PRESET_LABELS } from "@/lib/nlp/hyperparams";
import { sameSentence } from "@/lib/nlp/intents";
import { countCorrect, datasetKey, recordRoundResult } from "@/lib/nlp/rounds";
import { comparePaths } from "@/lib/nlp/simulator";
import { FINAL_TEST_LOG, PRACTICE_LOGS, referenceCommands } from "@/lib/nlp/testLogs";
import { useFinalTest } from "@/lib/nlp/useFinalTest";
import { useLogPredictions } from "@/lib/nlp/useLogPredictions";
import { useTrainingRun } from "@/lib/nlp/useTrainingRun";
import Callout from "@/components/ui/Callout";
import CodeBlock from "@/components/ui/CodeBlock";
import DistanceResult from "@/components/ui/DistanceResult";
import ExampleEditor from "@/components/ui/ExampleEditor";
import MissingIntentsCallout from "@/components/ui/MissingIntentsCallout";
import PredictionTable from "@/components/ui/PredictionTable";
import RoundHistory from "@/components/ui/RoundHistory";
import StartOverButton from "@/components/ui/StartOverButton";
import TrainingChart from "@/components/ui/TrainingChart";

const CARD = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";
const H2 = "text-lg font-semibold text-slate-800 dark:text-slate-200";
const NOTE = "text-sm text-slate-600 dark:text-slate-400";
const BUTTON =
  "rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-sky-600";
const OUTLINE_BUTTON =
  "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
const SMALL_BUTTON =
  "rounded-md border border-sky-600 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-slate-800";

export default function Step5TestIterate() {
  const { state } = useMission();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">5. Test &amp; Iterate</h1>
      </header>
      {state.final_test ? (
        <FinalResults finalTest={state.final_test} history={state.round_history} />
      ) : (
        <PracticeRounds />
      )}
    </section>
  );
}

function Intro() {
  return (
    <div className="space-y-2 text-slate-600 dark:text-slate-400">
      <p>
        Your model has never seen these practice logs. Each round runs one log through your model and marks
        every sentence. When it gets one wrong, add a similar example to your dataset and retrain. Then check
        two things:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Run the same log again.</strong> If the sentence is right now, that mostly shows{" "}
          <em>memorization</em>: the model has seen that sentence, or one very like it.
        </li>
        <li>
          <strong>Move on to the next practice log.</strong> If the model also gets new sentences of that kind
          right, that shows <em>generalization</em>: it learned what the words mean, not just the words.
        </li>
      </ul>
      <p>
        The second check is the one that counts. When you&apos;re ready, take the final test: one last log that
        neither you nor your model has seen.
      </p>
    </div>
  );
}

function PracticeRounds() {
  const { state, setField, updateField } = useMission();
  const jobId = state.job_id;
  const round = state.practice_round;
  const log = PRACTICE_LOGS[round];
  const isLastLog = round === PRACTICE_LOGS.length - 1;

  // One "Add a similar example" form open at a time, and the note left by the last add.
  const [openForm, setOpenForm] = useState<number | null>(null);
  const [addNote, setAddNote] = useState<{ index: number; text: string } | null>(null);
  const [confirmingFinal, setConfirmingFinal] = useState(false);

  const { phase, predictions, refresh } = useLogPredictions(log, {
    onResult: (logId, correct, total) =>
      updateField("round_history", (prev) => recordRoundResult(prev, logId, correct, total)),
  });
  const { isTraining, error, train, missingIntents } = useTrainingRun({ onCompleted: refresh });
  const finalTest = useFinalTest();
  const finalRunning = finalTest.status === "running";

  const hasFirstTry = state.round_history.some((r) => r.log_id === log.id);
  const correctCount = predictions ? countCorrect(log, predictions) : null;
  const refreshing = phase === "loading" && predictions !== null;
  const datasetChanged =
    state.model_trained &&
    state.trained_dataset_key !== null &&
    state.trained_dataset_key !== datasetKey(state.labeled_examples);
  const retrainDisabled = isTraining || finalRunning || !jobId || phase === "loading" || missingIntents.length > 0;

  const addSimilar = (index: number, example: TrainingExample): string | null => {
    if (isTraining) return "Wait for training to finish, then add it.";
    const result = planTeach(state.labeled_examples, example);
    if (result.kind !== "already") setField("labeled_examples", result.next);
    setOpenForm(null);
    setAddNote({
      index,
      text:
        result.kind === "already"
          ? "Already in your dataset with this label. Retrain to use it."
          : result.kind === "added"
            ? "Added to your dataset. Retrain to see if it helps."
            : `Replaced your earlier label (${exampleCommand(result.previous)}) with this one. Retrain to see if it helps.`,
    });
    return null;
  };

  const nextLog = () => {
    if (!hasFirstTry || isLastLog) return;
    setOpenForm(null);
    setAddNote(null);
    setField("practice_round", round + 1);
  };

  return (
    <>
      <Intro />

      <RoundHistory history={state.round_history} />

      <div>
        <h2 className={`mb-2 ${H2}`}>
          Practice log {round + 1} of {PRACTICE_LOGS.length}
        </h2>
        <CodeBlock text={log.mission_log} />
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
            onClick={refresh}
            disabled={!jobId}
            className="mt-2 font-medium underline disabled:opacity-60"
          >
            Try again
          </button>
        </Callout>
      ) : null}

      {phase !== "needs-training" ? (
        <div className={`${CARD} space-y-3`}>
          <div>
            <h2 className={`flex flex-wrap items-baseline gap-x-3 ${H2}`}>
              Retrain
              {datasetChanged ? (
                <span
                  role="status"
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                >
                  Dataset changed since your last training. Retrain to use the changes.
                </span>
              ) : null}
            </h2>
            <p className={`mt-1 ${NOTE}`}>
              Trains a fresh model on your <strong>{state.labeled_examples.length}</strong> examples with{" "}
              <strong>{state.epochs}</strong> epochs and the{" "}
              <strong>{PRESET_LABELS[state.learning_rate_preset].title}</strong> learning rate (
              <Link href="/steps/4" className="font-medium text-sky-700 underline dark:text-sky-400">
                change these in Step 4
              </Link>
              ), then runs this practice log again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAddNote(null);
              train();
            }}
            disabled={retrainDisabled}
            aria-busy={isTraining}
            className={BUTTON}
          >
            {isTraining ? "Training…" : "Retrain"}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each training run starts from fresh random numbers, so scores can move a little even when your
            dataset hasn&apos;t changed. Judge a fix by the next practice log, not by one sentence.
          </p>
          <MissingIntentsCallout missing={missingIntents} />
          {error ? (
            <Callout tone="warning" title="Retraining didn't finish">
              <p>{error.text}</p>
              {error.serverFailed && state.model_trained ? <p>Your previously trained model is still in place.</p> : null}
            </Callout>
          ) : null}
          {state.training_history.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                Training curves
              </summary>
              <div className="mt-2">
                <TrainingChart history={state.training_history} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {phase === "loading" && predictions === null ? (
        <p className={NOTE} role="status">
          Running your model on this log…
        </p>
      ) : null}

      {predictions ? (
        <div className="space-y-3">
          <h2 className={`flex flex-wrap items-baseline gap-x-3 ${H2}`}>
            Your model&apos;s predictions
            {correctCount !== null ? (
              <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                {correctCount} / {log.examples.length} correct
              </span>
            ) : null}
            {refreshing ? (
              <span
                role="status"
                className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-100"
              >
                Refreshing…
              </span>
            ) : null}
          </h2>

          <PredictionTable
            examples={log.examples}
            predictions={predictions}
            busy={refreshing}
            renderExtra={(i, correct) => {
              const truth = log.examples[i];
              const inDataset = state.labeled_examples.some((e) => sameSentence(e.sentence, truth.sentence));
              return (
                <>
                  {inDataset ? (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">In your dataset</span>
                  ) : null}
                  {!correct && openForm !== i ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenForm(i);
                        setAddNote(null);
                      }}
                      disabled={isTraining || finalRunning}
                      className={`${SMALL_BUTTON} block whitespace-nowrap`}
                    >
                      Add a similar example
                    </button>
                  ) : null}
                  {openForm === i ? (
                    <div className="mt-2 min-w-72 space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Add a similar example</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Keep the sentence as it is, or reword it the way an astronaut might say the same thing. Two
                        or three reworded versions teach the meaning better than one exact copy, which mostly
                        teaches the model this one line.
                      </p>
                      <ExampleEditor
                        initial={truth}
                        submitLabel="Add to my dataset"
                        onSubmit={(example) => addSimilar(i, example)}
                        onCancel={() => setOpenForm(null)}
                      />
                    </div>
                  ) : null}
                  {addNote?.index === i ? (
                    <span className="block text-xs text-slate-600 dark:text-slate-400" role="status">
                      {addNote.text}
                    </span>
                  ) : null}
                </>
              );
            }}
          />

          <p className="text-xs text-slate-500 dark:text-slate-400">
            A prediction counts as correct when the command matches and, for STRAIGHT and BACKWARDS, the
            distance is within {AMOUNT_TOLERANCE_CM} cm.
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <button
          type="button"
          onClick={nextLog}
          disabled={!hasFirstTry || isLastLog || isTraining || finalRunning}
          className={OUTLINE_BUTTON}
        >
          Next practice log →
        </button>
        {isLastLog && hasFirstTry ? (
          <p className={NOTE}>That was the last practice log. Take the final test when you&apos;re ready.</p>
        ) : !hasFirstTry ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Run this log first.</p>
        ) : null}
      </div>

      <div className={`${CARD} space-y-3`}>
        <h2 className={H2}>The final test</h2>
        <div className={`space-y-2 ${NOTE}`}>
          <p>
            The final test runs one more mission log that neither you nor your model has seen. Like a real
            deployment, it counts once: there&apos;s no fixing it afterwards.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>It runs once, on the model you have now.</li>
            <li>After it, training is locked for this session, here and in Step 4.</li>
            <li>Step 6 then compares your model&apos;s answers with an LLM&apos;s on the same log.</li>
          </ul>
        </div>

        {confirmingFinal ? (
          <div className="space-y-2" role="group" aria-label="Confirm final test">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Ready? Your model gets one try, and training locks afterwards.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => finalTest.take({ isTraining })}
                disabled={isTraining || finalRunning || !jobId}
                aria-busy={finalRunning}
                className={BUTTON}
              >
                {finalRunning ? "Running the final test…" : "Yes, take the final test"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingFinal(false)}
                disabled={finalRunning}
                className={OUTLINE_BUTTON}
              >
                Not yet
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setConfirmingFinal(true)}
              disabled={state.round_history.length === 0 || isTraining || !jobId}
              className={BUTTON}
            >
              Take the final test
            </button>
            {state.round_history.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Play at least one practice round first.</p>
            ) : null}
          </div>
        )}

        {finalTest.status === "needs-training" ? (
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
        {finalTest.status === "unreachable" ? (
          <Callout tone="warning" title="Couldn't run the final test">
            <p>Couldn&apos;t reach the server at {API_BASE_URL}. Nothing was saved, so you can try again.</p>
            <button
              type="button"
              onClick={() => finalTest.take({ isTraining })}
              disabled={isTraining || !jobId}
              className="mt-2 font-medium underline disabled:opacity-60"
            >
              Try again
            </button>
          </Callout>
        ) : null}
      </div>
    </>
  );
}

function FinalResults({ finalTest, history }: { finalTest: FinalTestResult; history: readonly RoundResult[] }) {
  const pathResult = comparePaths(
    finalTest.predictions.map((p) => p.command).join("\n"),
    referenceCommands(FINAL_TEST_LOG),
  );
  return (
    <>
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
        Final test: {finalTest.correct} / {finalTest.total} correct
      </h2>

      <Callout tone="info" title="Training is locked.">
        <p>
          You&apos;ve taken the final test, so this model is final for this session.{" "}
          <Link href="/steps/6" className="font-medium underline">
            Compare it with an LLM in Step 6
          </Link>
          .
        </p>
      </Callout>

      <div>
        <h2 className={`mb-2 ${H2}`}>The final-test log</h2>
        <CodeBlock text={FINAL_TEST_LOG.mission_log} />
      </div>

      <PredictionTable examples={FINAL_TEST_LOG.examples} predictions={finalTest.predictions} />

      <div>
        <h2 className={H2}>Where does the robot end up?</h2>
        <p className={`mt-1 ${NOTE}`}>
          Your model&apos;s commands and the reference commands, each driven from the same start. The distance is
          between the two end points.
        </p>
        <DistanceResult
          result={pathResult}
          studentLabel="Your model's commands"
          bands={HELD_OUT_PATH_BANDS}
          messages={{
            success: (d) => `Excellent! Your model's path ends ${d} cm from the reference.`,
            info: (d) => `Close: ${d} cm from the reference. The route is right, but an amount is a bit off.`,
            warning: (d) =>
              `Your model's path ends ${d} cm from the reference. A wrong turn or a big distance miss sends the robot somewhere else.`,
          }}
        />
      </div>

      <RoundHistory history={history} />

      <StartOverButton />
    </>
  );
}
