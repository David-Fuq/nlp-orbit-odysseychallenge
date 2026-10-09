import { describe, expect, it } from "vitest";
import { BASE_EXAMPLES } from "@/lib/nlp/baseExamples";
import { DEFAULTS, isUuid, restoreMissionState } from "./missionStorage";

const ID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const NEW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const newId = () => NEW_ID;

describe("restoreMissionState", () => {
  it("upgrades a pre-PR-07 blob: new job_id, seeded examples, removed fields dropped", () => {
    const oldBlob = {
      mission_log_1: "my log",
      actions_list: "cruise, forward",
      amounts_list: "two",
      landmarks_list: "crater",
      student_commands_1: "STRAIGHT 40",
      move_synonyms: "go",
      turn_synonyms: "turn",
      left_synonyms: "left",
      right_synonyms: "right",
      student_dict_notes: "notes",
      student_new_commands: "",
      llm_commands_new: "",
    };
    const { state, generated } = restoreMissionState(oldBlob, DEFAULTS, newId);
    expect(generated).toBe(true);
    expect(state.job_id).toBe(NEW_ID);
    expect(state.labeled_examples).toEqual(BASE_EXAMPLES);
    expect(state.mission_log_1).toBe("my log");
    expect(state.move_synonyms).toBe("go");
    expect(state).not.toHaveProperty("actions_list");
    expect(state).not.toHaveProperty("amounts_list");
    expect(state).not.toHaveProperty("landmarks_list");
  });

  it("keeps a stored UUID and stored examples", () => {
    const examples = [{ sentence: "creep on 5 cm", intent: "STRAIGHT", amount_cm: 5 }];
    const { state, generated } = restoreMissionState(
      { job_id: ID, labeled_examples: examples },
      DEFAULTS,
      newId,
    );
    expect(generated).toBe(false);
    expect(state.job_id).toBe(ID);
    expect(state.labeled_examples).toEqual(examples);
  });

  it("keeps an empty stored dataset rather than reseeding it", () => {
    const { state } = restoreMissionState({ job_id: ID, labeled_examples: [] }, DEFAULTS, newId);
    expect(state.labeled_examples).toEqual([]);
  });

  it("falls back to the seed when stored examples are malformed", () => {
    const bad = [{ sentence: "turn", intent: "TURN_LEFT", amount_cm: 90 }];
    const { state } = restoreMissionState({ job_id: ID, labeled_examples: bad }, DEFAULTS, newId);
    expect(state.labeled_examples).toEqual(BASE_EXAMPLES);
  });

  it("regenerates a job_id that isn't a UUID", () => {
    for (const job_id of ["", "abc", 42, null]) {
      const { state, generated } = restoreMissionState({ job_id }, DEFAULTS, newId);
      expect(generated).toBe(true);
      expect(state.job_id).toBe(NEW_ID);
    }
  });

  it("returns defaults plus a new id for non-object input", () => {
    for (const stored of [null, "x", 3, []]) {
      const { state } = restoreMissionState(stored, DEFAULTS, newId);
      expect(state).toEqual({ ...DEFAULTS, job_id: NEW_ID });
    }
  });

  it("ignores wrongly typed string fields", () => {
    const { state } = restoreMissionState({ mission_log_1: 5 }, DEFAULTS, newId);
    expect(state.mission_log_1).toBe(DEFAULTS.mission_log_1);
  });

  it("does not share the defaults' examples array", () => {
    const { state } = restoreMissionState(null, DEFAULTS, newId);
    expect(state.labeled_examples).not.toBe(DEFAULTS.labeled_examples);
  });
});

describe("isUuid", () => {
  it("accepts crypto.randomUUID() output and rejects other strings", () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
