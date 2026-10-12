// Three-word sequences the way the backend model tokenises: lowercase,
// whitespace split, punctuation stripped from token edges, numerals as <num>.
// Mirrors backend/app/services/tokenizer.py and test_corpus.py's _trigrams.
// Used by the tests that keep the final-test log out of training data and out
// of the page before the final test.

export function trigrams(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""))
    .filter((t) => t !== "")
    .map((t) => (Number.isFinite(Number(t)) ? "<num>" : t));
  const out = new Set<string>();
  for (let i = 0; i + 3 <= tokens.length; i++) out.add(tokens.slice(i, i + 3).join(" "));
  return out;
}
