import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BASE_EXAMPLES } from "./baseExamples";
import { CANDIDATE_SENTENCES } from "./candidateSentences";
import { INTENTS } from "./intents";
import { FINAL_TEST_LOG, PRACTICE_LOGS, referenceCommands } from "./testLogs";

const SOURCE = new URL("../../../../backend/app/services/data/test_logs.json", import.meta.url);
const COPY = new URL("./testLogs.json", import.meta.url);

// git's autocrlf checks both files out with the platform's line endings, so
// compare them with line endings normalised; everything else must match.
function readText(url: URL): string {
  return readFileSync(fileURLToPath(url), "utf8").replace(/\r\n/g, "\n");
}

// Three-word sequences the way the backend model tokenises: lowercase,
// whitespace split, punctuation stripped from token edges, numerals as <num>.
// Mirrors backend/app/services/tokenizer.py and test_corpus.py's _trigrams.
function trigrams(sentence: string): Set<string> {
  const tokens = sentence
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""))
    .filter((t) => t !== "")
    .map((t) => (Number.isFinite(Number(t)) ? "<num>" : t));
  const out = new Set<string>();
  for (let i = 0; i + 3 <= tokens.length; i++) out.add(tokens.slice(i, i + 3).join(" "));
  return out;
}

describe("test-log bank", () => {
  it("matches backend/app/services/data/test_logs.json", () => {
    const source = readText(SOURCE);
    expect(readText(COPY)).toBe(source);
    const json = JSON.parse(source) as { practice: unknown[]; final: unknown };
    expect(PRACTICE_LOGS).toEqual(json.practice);
    expect(FINAL_TEST_LOG).toEqual(json.final);
  });

  it("exports five practice logs and the final log", () => {
    expect(PRACTICE_LOGS.map((log) => log.id)).toEqual([
      "practice-1",
      "practice-2",
      "practice-3",
      "practice-4",
      "practice-5",
    ]);
    expect(FINAL_TEST_LOG.id).toBe("final");
    for (const log of PRACTICE_LOGS) {
      expect(log.examples.length).toBeGreaterThanOrEqual(6);
      expect(log.examples.length).toBeLessThanOrEqual(7);
      expect(new Set(log.examples.map((e) => e.intent))).toEqual(new Set(INTENTS));
      expect(log.examples).toHaveLength(log.mission_log.split(/(?<=\.)\s+/).length);
    }
  });

  it("formats reference commands one per sentence", () => {
    expect(referenceCommands(FINAL_TEST_LOG)).toBe(
      ["STRAIGHT 7", "TURN RIGHT", "STRAIGHT 38", "TURN 180", "BACKWARDS 143", "TURN LEFT", "STRAIGHT 64"].join("\n"),
    );
    for (const log of PRACTICE_LOGS) {
      expect(referenceCommands(log).split("\n")).toHaveLength(log.examples.length);
    }
  });

  it("shares no three-word sequence with Step 2 candidates or starter examples", () => {
    // Both end up in the student's training data, so overlap would turn a
    // practice round into a memorization check.
    const training = [...CANDIDATE_SENTENCES, ...BASE_EXAMPLES.map((e) => e.sentence)];
    const banned = new Set(training.flatMap((s) => [...trigrams(s)]));
    const shared = PRACTICE_LOGS.flatMap((log) =>
      log.examples.flatMap((e) => [...trigrams(e.sentence)].filter((g) => banned.has(g)).map((g) => `${e.sentence}: ${g}`)),
    );
    expect(shared).toEqual([]);
  });
});
