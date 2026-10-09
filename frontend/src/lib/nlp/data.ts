// Mission logs, reference commands, and lookup tables the guided flow is
// built around. Originally ported verbatim from the Streamlit prototype
// (Original_by_Rushiil/nlp_analysis.py); the command grammar has since been
// migrated to the five-command vocabulary (STRAIGHT / BACKWARDS / TURN RIGHT
// / TURN LEFT / TURN 180), so the logs and command lists below no longer
// match the prototype's.

// NOTE: the mission-log prose below is placeholder-quality and wants an
// editorial pass. Whenever it changes, REFERENCE_COMMANDS must change with
// it — that command list is the ground truth for this log, so prose and
// commands drifting apart is a real bug, not a copy nit. (The held-out test
// log for Steps 5 and 6 lives in heldOutTestLog.ts.)

export const SAMPLE_MISSION_LOG = `From your current position, roll straight ahead 40 centimeters
until you are just past the first crater. Then rotate 90 degrees to
your right so you are facing the communications tower, and creep
straight on another 25 centimeters to park at its base.`;

export const REFERENCE_COMMANDS = `STRAIGHT 40
TURN RIGHT
STRAIGHT 25
`;

// Builds the suggested LLM prompt for Step 6 (already includes the log).
// Step 6 passes HELD_OUT_MISSION_LOG, whose turns name a direction or a
// half turn ("pivot to the right", "swap ends", "haul around to the left")
// rather than an angle, and one of whose sentences only says to wait.
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
- A turn that names only a direction ("to the left", "to the right") is
  TURN LEFT or TURN RIGHT, whatever verb the log uses. Turning around to face
  the opposite way is TURN 180.
- Waiting or holding position is not a command: write nothing for it.
- STRAIGHT and BACKWARDS always take a whole number of centimeters. If the
  log describes a distance vaguely or in some other unit, choose a
  reasonable whole centimeter value between 5 and 150.

Now convert the following mission log into commands:

${missionLog}
`;
}
