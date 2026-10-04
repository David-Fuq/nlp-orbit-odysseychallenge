// Constants ported verbatim from the Streamlit prototype
// (Original_by_Rushiil/nlp_analysis.py). These are the mission logs,
// reference commands, and lookup tables the guided flow is built around.

export const SAMPLE_MISSION_LOG = `From your current position, cruise forward about two floor tiles
until you're just past the first crater. Then pivot right a quarter
turn to face the communications tower.`;

export const REFERENCE_COMMANDS = `MOVE 2
TURN 90
`;

export const NEW_MISSION_LOG = `Drift ahead three floor tiles, then swing around to face the first
crater you see on your right.`;

export const NEW_REFERENCE_COMMANDS = `MOVE 3
TURN 90
`;

// Simple number word -> integer map for the demo.
// Kept as a record for value lookups; NUMBER_WORD_KEYS preserves the
// prototype's insertion order for the Step 5 detection display.
export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  "1": 1,
  two: 2,
  "2": 2,
  three: 3,
  "3": 3,
  four: 4,
  "4": 4,
};

export const NUMBER_WORD_KEYS = ["one", "1", "two", "2", "three", "3", "four", "4"];

export const ANGLE_PHRASES: Record<string, number> = {
  "quarter turn": 90,
  "half turn": 180,
  "full turn": 360,
};

// Step 4 "training data" examples shown to students.
export const TRAINING_EXAMPLES: ReadonlyArray<readonly [phrase: string, command: string]> = [
  ["Cruise forward two tiles.", "MOVE 2"],
  ["Advance three steps.", "MOVE 3"],
  ["Rotate left a half turn.", "TURN -180"],
  ["Pivot right a quarter turn.", "TURN 90"],
  ["Back up one tile.", "MOVE -1"],
];

// Default synonym lists (from the prototype's st.session_state init).
export const DEFAULT_MOVE_SYNONYMS = "forward, advance, cruise, ahead";
export const DEFAULT_TURN_SYNONYMS = "turn, pivot, rotate, swing";
export const DEFAULT_LEFT_SYNONYMS = "left, counterclockwise";
export const DEFAULT_RIGHT_SYNONYMS = "right, clockwise";

// Default key-phrase lists (from the Step 2 text_area defaults).
export const DEFAULT_ACTIONS = "cruise, forward, pivot";
export const DEFAULT_AMOUNTS = "two, tiles, quarter turn";
export const DEFAULT_LANDMARKS = "first crater, communications tower";

// Builds the suggested LLM prompt for Step 6 (already includes the log).
export function buildLlmPrompt(missionLog: string): string {
  return `You are helping students translate a lunar mission log into simple robot commands for a small classroom robot.

Rules:
- The robot moves on a square-tile floor.
- Valid commands are:
  - MOVE <number_of_tiles>
  - TURN <degrees_clockwise>
- Use one command per line.
- Do NOT include explanations or extra text, only the commands.
- Positive TURN angles mean turning right/clockwise.
- Negative TURN angles mean turning left/counterclockwise.
- If a direction is described qualitatively (e.g., "quarter turn to the right"),
  choose a reasonable degree value (e.g., 90 for a quarter turn, 180 for a half turn).

Now convert the following mission log into commands:

${missionLog}
`;
}
