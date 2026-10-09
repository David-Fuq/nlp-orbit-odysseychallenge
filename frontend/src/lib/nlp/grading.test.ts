import { describe, expect, it } from "vitest";
import type { TrainingExample } from "./api";
import {
  AMOUNT_TOLERANCE_CM,
  exampleCommand,
  HELD_OUT_PATH_BANDS,
  isPredictionCorrect,
  planTeach,
} from "./grading";
import { HELD_OUT_EXAMPLES } from "./heldOutTestLog";
import { comparePaths } from "./simulator";

const straight40: TrainingExample = { sentence: "roll ahead 40 cm", intent: "STRAIGHT", amount_cm: 40 };
const back30: TrainingExample = { sentence: "back up 30 cm", intent: "BACKWARDS", amount_cm: 30 };
const left: TrainingExample = { sentence: "Hang a left", intent: "TURN_LEFT", amount_cm: null };

describe("isPredictionCorrect", () => {
  it("accepts an amount within 5 cm and rejects one further off", () => {
    expect(isPredictionCorrect(straight40, { intent: "STRAIGHT", amount_cm: 40 })).toBe(true);
    expect(isPredictionCorrect(straight40, { intent: "STRAIGHT", amount_cm: 45 })).toBe(true);
    expect(isPredictionCorrect(straight40, { intent: "STRAIGHT", amount_cm: 35 })).toBe(true);
    expect(isPredictionCorrect(straight40, { intent: "STRAIGHT", amount_cm: 46 })).toBe(false);
    expect(isPredictionCorrect(back30, { intent: "BACKWARDS", amount_cm: 24 })).toBe(false);
  });

  it("rejects the wrong intent even with the right amount", () => {
    expect(isPredictionCorrect(straight40, { intent: "BACKWARDS", amount_cm: 40 })).toBe(false);
    expect(isPredictionCorrect(left, { intent: "TURN_RIGHT", amount_cm: null })).toBe(false);
  });

  it("needs only the intent for a turn", () => {
    expect(isPredictionCorrect(left, { intent: "TURN_LEFT", amount_cm: null })).toBe(true);
  });

  it("handles a predicted amount of 0 or a missing amount", () => {
    const seven: TrainingExample = { sentence: "s", intent: "STRAIGHT", amount_cm: 7 };
    expect(isPredictionCorrect(seven, { intent: "STRAIGHT", amount_cm: 0 })).toBe(false);
    expect(isPredictionCorrect({ ...seven, amount_cm: 5 }, { intent: "STRAIGHT", amount_cm: 0 })).toBe(true);
    expect(isPredictionCorrect(seven, { intent: "STRAIGHT", amount_cm: null })).toBe(false);
  });
});

describe("exampleCommand", () => {
  it("formats all five intents in the robot grammar", () => {
    expect(exampleCommand(straight40)).toBe("STRAIGHT 40");
    expect(exampleCommand(back30)).toBe("BACKWARDS 30");
    expect(exampleCommand({ sentence: "s", intent: "TURN_RIGHT", amount_cm: null })).toBe("TURN RIGHT");
    expect(exampleCommand(left)).toBe("TURN LEFT");
    expect(exampleCommand({ sentence: "s", intent: "TURN_180", amount_cm: null })).toBe("TURN 180");
  });
});

describe("HELD_OUT_PATH_BANDS", () => {
  const reference = HELD_OUT_EXAMPLES.map(exampleCommand).join("\n");

  it("never grades an all-correct held-out run as a warning", () => {
    // Every amount off by the full tolerance, in every combination of signs.
    const amountIndexes = HELD_OUT_EXAMPLES.flatMap((e, i) => (e.amount_cm === null ? [] : [i]));
    let worst = 0;
    for (let signs = 0; signs < 2 ** amountIndexes.length; signs++) {
      const predicted = HELD_OUT_EXAMPLES.map((e, i) => {
        const k = amountIndexes.indexOf(i);
        if (k === -1) return e;
        const delta = (signs >> k) & 1 ? AMOUNT_TOLERANCE_CM : -AMOUNT_TOLERANCE_CM;
        const shifted = { ...e, amount_cm: (e.amount_cm as number) + delta };
        expect(isPredictionCorrect(e, shifted)).toBe(true);
        return shifted;
      });
      worst = Math.max(worst, comparePaths(predicted.map(exampleCommand).join("\n"), reference).distance);
    }
    expect(worst).toBeLessThan(HELD_OUT_PATH_BANDS.info);
  });

  it("grades an exact run as success and one wrong turn as a warning", () => {
    expect(comparePaths(reference, reference).distance).toBeLessThan(HELD_OUT_PATH_BANDS.success);
    const wrongTurn = reference.replace("TURN RIGHT", "TURN LEFT");
    expect(comparePaths(wrongTurn, reference).distance).toBeGreaterThanOrEqual(HELD_OUT_PATH_BANDS.info);
  });
});

describe("planTeach", () => {
  it("appends a sentence the dataset doesn't have", () => {
    const examples = [straight40];
    const result = planTeach(examples, back30);
    expect(result.kind).toBe("added");
    expect(result.next).toEqual([straight40, back30]);
    expect(examples).toEqual([straight40]);
  });

  it("is a no-op when the sentence is already there with the same label", () => {
    const examples = [straight40, { ...left, sentence: "  hang a LEFT " }];
    const result = planTeach(examples, left);
    expect(result.kind).toBe("already");
    expect(result.next).toBe(examples);
  });

  it("replaces a different label in place and drops further copies", () => {
    const wrong: TrainingExample = { sentence: "hang a left", intent: "TURN_RIGHT", amount_cm: null };
    const examples = [wrong, straight40, { ...left }];
    const result = planTeach(examples, left);
    expect(result.kind).toBe("relabeled");
    expect(result.next).toEqual([left, straight40]);
    if (result.kind === "relabeled") expect(result.previous).toEqual(wrong);
    expect(examples).toHaveLength(3);
  });

  it("treats a different amount as a different label", () => {
    const result = planTeach([{ ...straight40, amount_cm: 50 }], straight40);
    expect(result.kind).toBe("relabeled");
    expect(result.next).toEqual([straight40]);
  });
});
