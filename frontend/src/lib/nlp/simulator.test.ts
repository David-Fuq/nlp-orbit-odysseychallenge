import { describe, expect, it } from "vitest";
import { comparePaths, simulatePath } from "./simulator";
import { REFERENCE_COMMANDS } from "./data";
import { HELD_OUT_REFERENCE_COMMANDS } from "./heldOutTestLog";

describe("simulatePath", () => {
  // Anchor for the new grammar: from the origin facing 90 degrees, a forward
  // move then a right turn must end at (0, 2) with heading 0. (Replaces the
  // old "MOVE 2 + TURN 90" parity anchor against the Python prototype, whose
  // grammar this simulator no longer shares.)
  it("anchors STRAIGHT 2 + TURN RIGHT => (0, 2), heading 0", () => {
    const { x, y, heading, lines } = simulatePath("STRAIGHT 2\nTURN RIGHT");
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(2, 10);
    expect(heading).toBe(0);
    expect(lines).toEqual(["STRAIGHT 2", "TURN RIGHT"]);
  });

  it("moves forward along the heading for STRAIGHT", () => {
    const { x, y, heading } = simulatePath("STRAIGHT 40");
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(40, 10);
    expect(heading).toBe(90);
  });

  it("moves backward along the heading for BACKWARDS", () => {
    const { x, y, heading } = simulatePath("BACKWARDS 25");
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-25, 10);
    expect(heading).toBe(90);
  });

  it("rotates 90 degrees clockwise for TURN RIGHT", () => {
    expect(simulatePath("TURN RIGHT").heading).toBe(0);
  });

  it("rotates 90 degrees counter-clockwise for TURN LEFT", () => {
    expect(simulatePath("TURN LEFT").heading).toBe(180);
  });

  it("rotates a half turn for TURN 180", () => {
    expect(simulatePath("TURN 180").heading).toBe(270);
  });

  it("is case-insensitive", () => {
    const lower = simulatePath("straight 40\nturn right");
    const upper = simulatePath("STRAIGHT 40\nTURN RIGHT");
    expect(lower.x).toBeCloseTo(upper.x, 10);
    expect(lower.y).toBeCloseTo(upper.y, 10);
    expect(lower.heading).toBe(upper.heading);
  });

  it("runs a mixed multi-line program (the held-out reference)", () => {
    // STRAIGHT 7 -> (0,7) h90; TURN RIGHT -> h0; STRAIGHT 38 -> (38,7);
    // TURN 180 -> h180 (west); BACKWARDS 143 -> back east to (181,7);
    // TURN LEFT -> h270 (south); STRAIGHT 64 -> (181,-57).
    const { x, y, heading, lines } = simulatePath(HELD_OUT_REFERENCE_COMMANDS);
    expect(x).toBeCloseTo(181, 10);
    expect(y).toBeCloseTo(-57, 10);
    expect(heading).toBe(270);
    expect(lines).toHaveLength(7);
  });

  it("normalizes negative headings with non-negative modulo", () => {
    // TURN RIGHT twice from 90 => 90 - 180 = -90 -> 270
    expect(simulatePath("TURN RIGHT\nTURN RIGHT").heading).toBe(270);
    // TURN 180 twice from 90 => 90 - 360 = -270 -> 90
    expect(simulatePath("TURN 180\nTURN 180").heading).toBe(90);
    // TURN LEFT three times from 90 => 90 + 270 = 360 -> 0
    expect(simulatePath("TURN LEFT\nTURN LEFT\nTURN LEFT").heading).toBe(0);
  });

  it("skips malformed commands instead of throwing", () => {
    const text = [
      "STRAIGHT", // missing amount
      "STRAIGHT abc", // unparseable amount
      "BACKWARDS", // missing amount
      "WALK 3", // unknown command word
      "TURN", // missing direction
      "TURN SIDEWAYS", // unknown direction
    ].join("\n");
    const { lines, x, y, heading } = simulatePath(text);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(heading).toBe(90);
    expect(lines).toHaveLength(6);
  });

  it("no longer honors the old MOVE / signed-degree TURN grammar", () => {
    const { x, y, heading } = simulatePath("MOVE 2\nTURN 90\nTURN -45");
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(heading).toBe(90);
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
    // The reference ends well away from the origin at centimeter scale.
    expect(result.distance).toBeGreaterThan(10);
    expect(result.sameNumCommands).toBe(false);
  });
});
