import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELD_OUT_EXAMPLES, HELD_OUT_MISSION_LOG, HELD_OUT_REFERENCE_COMMANDS } from "./heldOutTestLog";
import { isTrainingExample } from "./intents";

const SOURCE = new URL("../../../../backend/app/services/data/test_log.json", import.meta.url);

describe("held-out test log", () => {
  const json = JSON.parse(readFileSync(fileURLToPath(SOURCE), "utf8")) as {
    mission_log: string;
    examples: { sentence: string; intent: string; amount_cm: number | null }[];
  };

  it("matches backend/app/services/data/test_log.json", () => {
    expect(HELD_OUT_MISSION_LOG).toBe(json.mission_log);
    expect(HELD_OUT_EXAMPLES).toHaveLength(json.examples.length);
    HELD_OUT_EXAMPLES.forEach((example, i) => {
      expect(example.sentence).toBe(json.examples[i].sentence);
      expect(example.intent).toBe(json.examples[i].intent);
      expect(example.amount_cm).toBe(json.examples[i].amount_cm);
    });
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
