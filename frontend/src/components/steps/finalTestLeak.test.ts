// The final-test log must stay unseen until the final test is taken: no step
// may render any of it before then, including Step 6's LLM prompt (which
// contains the log) and its discussion prompts (which quote it).
//
// Each step is server-rendered inside MissionProvider. Effects don't run on
// the server, so the page shows exactly the state passed in, which is what the
// student sees on first paint. The positive controls make sure the check would
// catch the log if it were there.

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import { CANDIDATE_SENTENCES } from "@/lib/nlp/candidateSentences";
import { SAMPLE_MISSION_LOG } from "@/lib/nlp/data";
import { exampleCommand } from "@/lib/nlp/grading";
import { FINAL_TEST_LOG, PRACTICE_LOGS } from "@/lib/nlp/testLogs";
import { trigrams } from "@/lib/nlp/trigrams";
import { MissionProvider } from "@/state/MissionContext";
import { DEFAULTS, type MissionState } from "@/state/missionStorage";
import Step1ReadLog from "./Step1ReadLog";
import Step2LabelExamples from "./Step2LabelExamples";
import Step3ReviewDataset from "./Step3ReviewDataset";
import Step4Train from "./Step4Train";
import Step5TestIterate from "./Step5TestIterate";
import Step6CompareLLM from "./Step6CompareLLM";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const STEPS: [string, ComponentType][] = [
  ["Step 1", Step1ReadLog],
  ["Step 2", Step2LabelExamples],
  ["Step 3", Step3ReviewDataset],
  ["Step 4", Step4Train],
  ["Step 5", Step5TestIterate],
  ["Step 6", Step6CompareLLM],
];

const ID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";

/**
 * The page's visible text, one entry per run of text between tags, lowercased
 * with entities resolved. Kept apart so a three-word sequence can't be made up
 * of words from neighbouring elements (e.g. a distance next to an intent label).
 */
function renderTexts(Step: ComponentType, state: MissionState): string[] {
  const html = renderToStaticMarkup(createElement(MissionProvider, { initialState: state }, createElement(Step)));
  return html
    .split(/<[^>]*>/)
    .map((s) =>
      s
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter((s) => s !== "");
}

// Three-word sequences the steps may show anyway because other, public
// material has them too (e.g. "another <num> centimeters" in Step 1's log).
const PUBLIC_GRAMS = new Set(
  [
    SAMPLE_MISSION_LOG,
    ...BASE_EXAMPLES.map((e) => e.sentence),
    ...CANDIDATE_SENTENCES,
    ...PRACTICE_LOGS.map((l) => l.mission_log),
  ].flatMap((s) => [...trigrams(s)]),
);

/** Everything of the final-test log that appears in the page's `texts`. */
function finalLogLeaks(texts: string[]): string[] {
  const text = texts.join(" ");
  const textGrams = new Set(texts.flatMap((t) => [...trigrams(t)]));
  const narrative = FINAL_TEST_LOG.mission_log.split(/(?<=\.)\s+/).map((s) => s.toLowerCase());
  return [
    ...FINAL_TEST_LOG.examples.map((e) => e.sentence).filter((s) => text.includes(s.toLowerCase())),
    ...narrative.filter((s) => text.includes(s)),
    ...FINAL_TEST_LOG.examples.flatMap((e) =>
      [...trigrams(e.sentence)].filter((g) => textGrams.has(g) && !PUBLIC_GRAMS.has(g)),
    ),
  ];
}

const takenState: MissionState = {
  ...DEFAULTS,
  job_id: ID,
  model_trained: true,
  final_test: {
    predictions: FINAL_TEST_LOG.examples.map((e) => ({ ...e, command: exampleCommand(e) })),
    correct: FINAL_TEST_LOG.examples.length,
    total: FINAL_TEST_LOG.examples.length,
    taken_at: "2026-10-12T10:00:00.000Z",
    examples_count: DEFAULTS.labeled_examples.length,
  },
};

describe("final-test log before the final test", () => {
  it("Steps 1–6 render no part of the final-test log before the final test", () => {
    for (const state of [DEFAULTS, { ...DEFAULTS, job_id: ID, model_trained: true }]) {
      for (const [name, Step] of STEPS) {
        expect({ step: name, leaks: finalLogLeaks(renderTexts(Step, state)) }).toEqual({ step: name, leaks: [] });
      }
    }
  });

  it("Step 6 shows the final-test prompt once the final test is taken", () => {
    const texts = renderTexts(Step6CompareLLM, takenState);
    const text = texts.join(" ");
    expect(text).toContain(FINAL_TEST_LOG.mission_log.toLowerCase());
    expect(text).toContain("swap ends");
    expect(finalLogLeaks(texts).length).toBeGreaterThan(0);
  });

  it("Step 5 shows the final-test sentences in its results view", () => {
    const texts = renderTexts(Step5TestIterate, takenState);
    const text = texts.join(" ");
    for (const e of FINAL_TEST_LOG.examples) expect(text).toContain(e.sentence);
    expect(text).toContain("training is locked");
    expect(finalLogLeaks(texts).length).toBeGreaterThan(0);
  });
});
