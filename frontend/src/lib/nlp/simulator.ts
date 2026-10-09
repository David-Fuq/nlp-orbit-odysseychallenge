// 2D path simulator + command comparison. Originally ported from the Python
// prototype (Original_by_Rushiil/nlp_analysis.py:48-102), but the command
// grammar has since DIVERGED from that prototype: the old `MOVE <tiles>` /
// `TURN <signed degrees>` pair has been replaced by the five-command
// vocabulary below (STRAIGHT / BACKWARDS / TURN RIGHT / TURN LEFT / TURN 180).
// The 2D math and the heading sign convention are unchanged, so results are
// still directly comparable with the prototype's for equivalent paths.

export interface SimResult {
  x: number;
  y: number;
  heading: number;
  lines: string[];
}

export type Position = [x: number, y: number, heading: number];

export interface CompareResult {
  studentPos: Position;
  refPos: Position;
  distance: number;
  sameNumCommands: boolean;
  studentList: string[];
  refList: string[];
}

/**
 * Very simple 2D simulator, one command per line, case-insensitive:
 * - Start at (0,0) facing "north" (90 degrees).
 * - STRAIGHT N   -> move forward N units along the current heading.
 * - BACKWARDS N  -> move backward N units (forward by -N).
 * - TURN RIGHT   -> heading -= 90 (clockwise).
 * - TURN LEFT    -> heading += 90 (counter-clockwise).
 * - TURN 180     -> heading -= 180.
 *
 * The distance unit is a dimensionless scalar; the UI labels it centimeters.
 * Malformed lines (unknown command word, unparseable or non-finite number,
 * a bare `TURN` with no direction) are skipped, mirroring the prototype's
 * skip-and-continue behavior on ValueError.
 *
 * heading in degrees: 0=East, 90=North, 180=West, 270=South.
 */
export function simulatePath(commandsText: string): SimResult {
  let x = 0;
  let y = 0;
  let heading = 90; // degrees

  const lines = commandsText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const parts = line.toUpperCase().split(/\s+/);
    const [command, argument] = parts;

    if (command === "STRAIGHT" || command === "BACKWARDS") {
      if (argument === undefined) continue;
      const amount = Number(argument);
      if (!Number.isFinite(amount)) continue;
      const dist = command === "BACKWARDS" ? -amount : amount;
      const rad = (heading * Math.PI) / 180;
      x += dist * Math.cos(rad);
      y += dist * Math.sin(rad);
    } else if (command === "TURN") {
      if (argument === "RIGHT") heading -= 90;
      else if (argument === "LEFT") heading += 90;
      else if (argument === "180") heading -= 180;
      // Anything else after TURN (including the old signed-degree form) is
      // not part of the vocabulary and is skipped.
    }
  }

  // Non-negative modulo to match Python's `heading % 360`.
  const normalizedHeading = ((heading % 360) + 360) % 360;
  return { x, y, heading: normalizedHeading, lines };
}

export function comparePaths(studentCmds: string, refCmds: string): CompareResult {
  const student = simulatePath(studentCmds);
  const ref = simulatePath(refCmds);

  const distance = Math.sqrt(
    (student.x - ref.x) ** 2 + (student.y - ref.y) ** 2,
  );

  return {
    studentPos: [student.x, student.y, student.heading],
    refPos: [ref.x, ref.y, ref.heading],
    distance,
    sameNumCommands: student.lines.length === ref.lines.length,
    studentList: student.lines,
    refList: ref.lines,
  };
}
