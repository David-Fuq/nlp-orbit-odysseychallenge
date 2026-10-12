// The held-out test mission log for Step 5 (and Step 6's comparison): a
// narrative paragraph plus the ground-truth label of each of its sentences.
// Since PR-12 this is the test-log bank's final-test log (testLogs.ts); these
// names stay so Steps 5 and 6 don't change until PR-13 removes this shim.

import { FINAL_TEST_LOG, referenceCommands } from "./testLogs";

export const HELD_OUT_MISSION_LOG = FINAL_TEST_LOG.mission_log;

/** One per sentence of HELD_OUT_MISSION_LOG, in order. These are what /api/predict receives. */
export const HELD_OUT_EXAMPLES = FINAL_TEST_LOG.examples;

/**
 * The ground-truth robot commands for HELD_OUT_MISSION_LOG, one per line.
 * Step 5 and Step 6 both grade against this, so there is one copy.
 */
export const HELD_OUT_REFERENCE_COMMANDS = referenceCommands(FINAL_TEST_LOG);
