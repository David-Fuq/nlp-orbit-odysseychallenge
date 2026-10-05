// Mission logs, reference commands, and lookup tables the guided flow is
// built around. Originally ported verbatim from the Streamlit prototype
// (Original_by_Rushiil/nlp_analysis.py); the command grammar has since been
// migrated to the five-command vocabulary (STRAIGHT / BACKWARDS / TURN RIGHT
// / TURN LEFT / TURN 180), so the logs and command lists below no longer
// match the prototype's.

// NOTE: the mission-log prose below is placeholder-quality and wants an
// editorial pass. Whenever it changes, the matching *_REFERENCE_COMMANDS
// must change with it — those command lists are the ground truth the path
// grader compares student output against, so prose and commands drifting
// apart is a real bug, not a copy nit.

export const SAMPLE_MISSION_LOG = `From your current position, roll straight ahead 40 centimeters
until you are just past the first crater. Then rotate 90 degrees to
your right so you are facing the communications tower, and creep
straight on another 25 centimeters to park at its base.`;

export const REFERENCE_COMMANDS = `STRAIGHT 40
TURN RIGHT
STRAIGHT 25
`;

export const NEW_MISSION_LOG = `Roll straight ahead 60 centimeters until you reach the edge of the
ridge. Spin 180 degrees so you are facing the lander again, then
drive straight on 15 centimeters to clear the loose gravel. Back up
30 centimeters to give the sample tray some room, and finish with a
90 degree turn to your left so your antenna points at the relay dish.`;

export const NEW_REFERENCE_COMMANDS = `STRAIGHT 60
TURN 180
STRAIGHT 15
BACKWARDS 30
TURN LEFT
`;

// DEPRECATED: old tile/quarter-turn grammar; removed once PR-09 replaces Step 5.
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

// DEPRECATED: old tile/quarter-turn grammar; removed once PR-09 replaces Step 5.
export const NUMBER_WORD_KEYS = ["one", "1", "two", "2", "three", "3", "four", "4"];

// DEPRECATED: old tile/quarter-turn grammar; removed once PR-09 replaces Step 5.
export const ANGLE_PHRASES: Record<string, number> = {
  "quarter turn": 90,
  "half turn": 180,
  "full turn": 360,
};

// Step 4 "training data" examples shown to students — one per command in the
// vocabulary. Superseded later by the real generated corpus.
export const TRAINING_EXAMPLES: ReadonlyArray<readonly [phrase: string, command: string]> = [
  ["Roll straight ahead 40 centimeters.", "STRAIGHT 40"],
  ["Back up 25 centimeters.", "BACKWARDS 25"],
  ["Pivot 90 degrees to the right.", "TURN RIGHT"],
  ["Rotate 90 degrees counter-clockwise.", "TURN LEFT"],
  ["Spin 180 degrees to face the other way.", "TURN 180"],
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
- The robot drives on a flat floor and measures distance in centimeters.
- There are exactly five valid commands:
  - STRAIGHT <centimeters>  -> drive forward that many centimeters
  - BACKWARDS <centimeters> -> drive backward that many centimeters
  - TURN RIGHT              -> rotate 90 degrees clockwise, in place
  - TURN LEFT               -> rotate 90 degrees counter-clockwise, in place
  - TURN 180                -> rotate 180 degrees, in place
- Use one command per line.
- Do NOT include explanations or extra text, only the commands.
- Turns never carry a number of degrees. There is no "TURN 90" and no
  "TURN -45": a 90 degree turn is TURN RIGHT or TURN LEFT, and a half turn
  is TURN 180. For any other angle described in the log, pick the closest of
  those three.
- STRAIGHT and BACKWARDS always take a whole number of centimeters. If the
  log describes a distance vaguely or in some other unit, choose a
  reasonable whole centimeter value between 5 and 150.

Now convert the following mission log into commands:

${missionLog}
`;
}
