import { describe, expect, it } from "vitest";
import { comparePaths, parseSynonyms, simulatePath } from "./simulator";
import { REFERENCE_COMMANDS } from "./data";

describe("parseSynonyms", () => {
  it("splits, trims, lowercases, and drops empties", () => {
    expect(parseSynonyms("Forward,  Advance ,, cruise ")).toEqual([
      "forward",
      "advance",
      "cruise",
    ]);
  });
});

describe("simulatePath", () => {
  // Parity anchor: the reference commands (MOVE 2 then TURN 90) from origin
  // facing 90 degrees must end at (0, 2) with heading 0.
  it("matches the Python reference: MOVE 2 + TURN 90 => (0, 2), heading 0", () => {
    const { x, y, heading, lines } = simulatePath("MOVE 2\nTURN 90");
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(2, 10);
    expect(heading).toBe(0);
    expect(lines).toEqual(["MOVE 2", "TURN 90"]);
  });

  it("normalizes negative headings with non-negative modulo", () => {
    // TURN 180 twice from 90 => 90 - 360 = -270 -> 90
    expect(simulatePath("TURN 180\nTURN 180").heading).toBe(90);
    // TURN 100 from 90 => -10 -> 350
    expect(simulatePath("TURN 100").heading).toBe(350);
  });

  it("skips malformed commands instead of throwing", () => {
    const { lines, x, y } = simulatePath("MOVE\nMOVE abc\nWALK 3");
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(lines).toEqual(["MOVE", "MOVE abc", "WALK 3"]);
  });
});

describe("comparePaths", () => {
  it("reports ~0 distance for identical reference paths", () => {
    const result = comparePaths(REFERENCE_COMMANDS, REFERENCE_COMMANDS);
    expect(result.distance).toBeCloseTo(0, 10);
    expect(result.sameNumCommands).toBe(true);
  });

  it("reports a large distance for empty student commands", () => {
    const result = comparePaths("", REFERENCE_COMMANDS);
    expect(result.distance).toBeGreaterThan(1.5);
    expect(result.sameNumCommands).toBe(false);
  });
});
