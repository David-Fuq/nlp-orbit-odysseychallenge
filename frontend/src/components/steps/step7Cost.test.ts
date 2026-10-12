// Step 7 server-rendered inside MissionProvider, like finalTestLeak.test.ts:
// effects don't run, so the page shows exactly the state passed in.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { exampleCommand } from "@/lib/nlp/grading";
import { FINAL_TEST_LOG, referenceCommands } from "@/lib/nlp/testLogs";
import { LLM_COST_FACTS } from "@/lib/llmCostFacts";
import { MissionProvider } from "@/state/MissionContext";
import { DEFAULTS, type MissionState } from "@/state/missionStorage";
import Step7Cost from "./Step7Cost";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const ID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const STATS = { parameters: 3528, training_seconds: 0.42, examples: 15, epochs: 20 };

function render(state: MissionState): string {
  return renderToStaticMarkup(createElement(MissionProvider, { initialState: state }, createElement(Step7Cost)));
}

/** Visible text, entities resolved, whitespace collapsed (and none left before punctuation). */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([,.])/g, "$1");
}

const trained: MissionState = { ...DEFAULTS, job_id: ID, model_trained: true, last_training_stats: STATS };

const taken: MissionState = {
  ...trained,
  final_test: {
    predictions: FINAL_TEST_LOG.examples.map((e) => ({ ...e, command: exampleCommand(e) })),
    correct: 6,
    total: FINAL_TEST_LOG.examples.length,
    taken_at: "2026-10-12T10:00:00.000Z",
    examples_count: 15,
  },
  labeling_started_at: "2026-10-12T09:23:00.000Z",
};

describe("Step 7", () => {
  it("shows a dashed receipt with a link to Step 4 before any training", () => {
    const html = render({ ...DEFAULTS, job_id: ID });
    expect(html).toContain("border-dashed");
    expect(html).toContain('href="/steps/4"');
    expect(text(html)).toContain("Your model hasn't been trained yet");
    expect(text(html)).toContain(`${DEFAULTS.labeled_examples.length} examples: 0 written or edited by you`);
    expect(text(html)).toContain("Train your model in Step 4 to see this one.");
  });

  it("asks for a retrain when the model predates training stats", () => {
    const t = text(render({ ...DEFAULTS, job_id: ID, model_trained: true }));
    expect(t).toContain("These rows fill in after your next training run");
  });

  it("shows the student's real numbers once trained", () => {
    const t = text(render(trained));
    expect(t).toContain("3,528 parameters");
    expect(t).toContain("0.42 seconds on the training server's CPU (20 epochs on 15 examples)");
    expect(t).toContain("less than 0.01¢");
    expect(t).toContain("assuming a 50 W laptop and $0.15 per kWh");
    expect(t).not.toContain("Your model hasn't been trained yet");
  });

  it("shows the final-test score, labeling time and Step 6 result after the test", () => {
    const t = text(render({ ...taken, llm_commands_held_out: referenceCommands(FINAL_TEST_LOG) }));
    expect(t).toContain(`6 of ${FINAL_TEST_LOG.examples.length} sentences correct`);
    expect(t).toContain("about 37 minutes, from when you first opened Step 2 until your final test");
    expect(t).toContain("your model's path ended 0.00 cm from the reference, and the LLM's ended 0.00 cm away");
  });

  it("links every LLM figure to its source, with its qualifier", () => {
    const html = render(trained);
    const t = text(html);
    for (const fact of LLM_COST_FACTS) {
      expect(html).toContain(`href="${fact.sourceUrl}"`);
      expect(t).toContain(`${fact.text}, ${fact.qualifier}`);
    }
    expect(t).toContain("the real total is higher");
    expect(t).toContain("tokens (words and pieces of words)");
  });

  it("never calls either model better", () => {
    for (const state of [DEFAULTS, trained, taken]) {
      const t = text(render(state)).toLowerCase();
      expect(t.replace("neither one is simply better", "")).not.toMatch(/\bbetter\b/);
    }
  });
});
