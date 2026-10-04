// 2D path simulator + command comparison, ported from the Python prototype
// (Original_by_Rushiil/nlp_analysis.py:48-102). Behavior is intended to match
// the original exactly so student results carry over from the Streamlit app.

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

/** Turn "word1, word2, word3" into ["word1", "word2", "word3"]. */
export function parseSynonyms(text: string): string[] {
  return text
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
}

/**
 * Very simple 2D simulator:
 * - Start at (0,0) facing "north" (90 degrees).
 * - MOVE N  -> move forward N tiles in current heading.
 * - TURN A  -> rotate by A degrees (positive = right/clockwise).
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
    if (parts.length === 0) continue;

    if (parts[0] === "MOVE" && parts.length >= 2) {
      const dist = Number(parts[1]);
      if (Number.isNaN(dist)) continue; // mirrors Python's try/except ValueError
      const rad = (heading * Math.PI) / 180;
      x += dist * Math.cos(rad);
      y += dist * Math.sin(rad);
    } else if (parts[0] === "TURN" && parts.length >= 2) {
      const angle = Number(parts[1]);
      if (Number.isNaN(angle)) continue;
      heading -= angle; // right turn is clockwise
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
