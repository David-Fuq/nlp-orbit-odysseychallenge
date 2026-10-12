import { describe, expect, it } from "vitest";
import { HELD_OUT_EXAMPLES, HELD_OUT_MISSION_LOG, HELD_OUT_REFERENCE_COMMANDS } from "./heldOutTestLog";
import { isTrainingExample } from "./intents";
import { FINAL_TEST_LOG } from "./testLogs";

describe("held-out test log", () => {
  it("is the final-test log", () => {
    expect(HELD_OUT_MISSION_LOG).toBe(FINAL_TEST_LOG.mission_log);
    expect(HELD_OUT_EXAMPLES).toBe(FINAL_TEST_LOG.examples);
  });

  it("has one valid example per sentence of the narrative", () => {
    const sentences = HELD_OUT_MISSION_LOG.split(/(?<=\.)\s+/);
    expect(HELD_OUT_EXAMPLES).toHaveLength(sentences.length);
    expect(HELD_OUT_EXAMPLES.every(isTrainingExample)).toBe(true);
  });

  it("formats the reference commands Steps 5 and 6 grade against", () => {
    expect(HELD_OUT_REFERENCE_COMMANDS).toBe(
      ["STRAIGHT 7", "TURN RIGHT", "STRAIGHT 38", "TURN 180", "BACKWARDS 143", "TURN LEFT", "STRAIGHT 64"].join("\n"),
    );
  });
});
