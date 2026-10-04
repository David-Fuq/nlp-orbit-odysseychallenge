# Week 1 — Frontend Migration: Scaffold Next.js app in `./frontend`

## Context

The Orbit Odyssey NLP challenge currently exists only as a **Streamlit prototype**
(`Original_by_Rushiil/nlp_analysis.py`, 6-step guided flow). The week-by-week plan
(`week-to-week-plan/nlp_challenge_plan_v2.tex`) sets **Week 1 (Sep 21–27)** as:

> "Set up the web application and move the current prototype onto it."

The locked design decisions in that plan require rebuilding the Streamlit app as a
**standalone Next.js (App Router) web application** so students need no local Python
install, with domain logic (tokenizer/command grammar, 2D path simulator) **ported to
TypeScript**. The trainable model / TensorFlow.js work is Week 2+ and is **out of scope
here** — Week 1 is scaffold + faithful port of the existing prototype.

Note: the file the request named (`week1_frontend_migration_plan.md`) does not exist;
Week 1 scope was taken from the `.tex` plan above.

**Outcome of this task:** a running Next.js app in `./frontend` that reproduces all six
prototype steps in the browser, with the numeric core (path simulator + comparison)
ported to TypeScript and shared cross-step state.

Decisions confirmed with user: **full 6-step port**, **Tailwind CSS**.
Toolchain present: Node v22.14.0, npm 10.9.2 (no pnpm) → use **npm**.

## Installs (confirm before running — see note)

1. **`npx create-next-app@latest frontend`** with flags:
   `--typescript --tailwind --app --src-dir --eslint --use-npm --import-alias "@/*"`
   (this downloads packages and runs `npm install` automatically).
2. **Optional, recommended:** dev-only test deps for the numeric core —
   `npm install -D vitest` (run from `./frontend`).

> These are the only network/install steps. I will confirm with you before running
> either. Everything else below is local file creation.

## Target structure (`./frontend/src`)

```
app/
  layout.tsx              # root layout: <MissionProvider> + title/intro header
  page.tsx                # landing (mission intro) + link into steps
  globals.css             # Tailwind directives (from scaffold)
  (steps)/
    layout.tsx            # shared step chrome: sidebar "Mission Steps" nav + <main>
    step/[n]/page.tsx      # renders the step component for n = 1..6
components/
  Sidebar.tsx             # replaces st.sidebar.radio — 6 step links, active state
  steps/
    Step1ReadLog.tsx
    Step2ExtractPhrases.tsx
    Step3Translate.tsx
    Step4Dictionary.tsx
    Step5DecodeNew.tsx
    Step6CompareLLM.tsx
lib/nlp/
  data.ts                 # SAMPLE_MISSION_LOG, REFERENCE_COMMANDS, NEW_MISSION_LOG,
                          # NEW_REFERENCE_COMMANDS, NUMBER_WORDS, ANGLE_PHRASES, training examples
  simulator.ts            # parseSynonyms, simulatePath, comparePaths (+ types)
state/
  MissionContext.tsx      # React context mirroring st.session_state, sessionStorage-persisted
```

Routing note: dedicated routes (`/step/1`…`/step/6`) with a shared `(steps)/layout.tsx`
give shareable URLs and mirror the sidebar radio. The `MissionProvider` sits in the root
`layout.tsx` so state survives navigation between steps (Streamlit's `st.session_state`
equivalent).

## Port the domain logic → `lib/nlp/simulator.ts`

Direct ports of the Python functions (`nlp_analysis.py:48-102`):

- `parseSynonyms(text)` → `string[]` — split on `,`, trim, lowercase, drop empties.
- `simulatePath(commandsText)` → `{ x, y, heading, lines }` — start `(0,0)` heading `90`
  (0=E, 90=N). `MOVE n`: `x += n*cos(rad)`, `y += n*sin(rad)`. `TURN a`: `heading -= a`.
  **Match Python's non-negative modulo**: return `((heading % 360) + 360) % 360`.
- `comparePaths(studentCmds, refCmds)` → `{ studentPos, refPos, distance,
  sameNumCommands, studentList, refList }` — Euclidean distance between end positions.

**Parity anchor** (embed as a quick check / test): simulating `REFERENCE_COMMANDS`
(`MOVE 2` then `TURN 90`) from origin facing 90° must yield end position `(0, 2)` heading `0`.

`data.ts` holds the constants copied verbatim from the prototype (mission logs, reference
commands, number-word map, angle phrases, and the Step-4 training examples list).

## Rebuild the 6 steps (client components)

Each maps a Streamlit step to a React component; shared fields read/write `MissionContext`.

1. **Read Mission Log** — editable textarea for `mission_log_1` (default `SAMPLE_MISSION_LOG`) + goal callout. (`nlp_analysis.py:157-187`)
2. **Extract Key Phrases** — 3 textareas (actions / amounts / landmarks) + tokenization explainer. (`:193-241`)
3. **Translate to Commands** — naive sentence split of the current log, `student_commands_1` textarea, collapsible reference commands, and a **"Check my path"** button calling `comparePaths` with the <0.5 / <1.5 / else success-info-warning bands + side-by-side command lists. (`:247-303`)
4. **Build Dictionary** — training-examples list + MOVE/TURN/LEFT/RIGHT synonym inputs + notes, all persisted to context. (`:309-371`)
5. **Decode New Log** — show `NEW_MISSION_LOG`; detect which stored synonyms/number-words appear in it; `student_new_commands` textarea; reference expander; **"Check vs reference"** button (same distance bands). (`:377-455`)
6. **Compare with LLM** — render the LLM prompt template (built from `NEW_MISSION_LOG`), show the student's Step-5 commands, a paste box for `llm_commands_new`, and a **"Compare all three"** button (You / LLM / Reference distances + side-by-side). **No live API call** in Week 1 (matches the prototype's `# Still gotta add in key` note). (`:461-562`)

State keys carried in `MissionContext` (from `st.session_state`, `:136-151`):
`mission_log_1`, `actions_list`, `amounts_list`, `landmarks_list`, `student_commands_1`,
`move/turn/left/right_synonyms`, `student_dict_notes`, `student_new_commands`,
`llm_commands_new`. Persist to `sessionStorage`.

## Styling

Use Tailwind utilities for the layouts (multi-column step bodies via `grid`/`flex`, cards
for callouts, sidebar nav). Keep it clean and functional for Week 1; visual identity/branding
is a later open question in the plan.

## Verification

1. From `./frontend`: `npm run dev` → open `http://localhost:3000`.
2. Click through all 6 steps via the sidebar; confirm state persists across steps
   (e.g., synonyms entered in Step 4 are detected in Step 5).
3. Step 3: leave commands empty → large distance → warning; enter `MOVE 2` / `TURN 90`
   → distance ≈ 0.00 → success.
4. Step 6: paste sample commands → three-way comparison renders distances.
5. If test deps installed: `npx vitest run` passes the simulator parity test
   (`MOVE 2`+`TURN 90` ⇒ end `(0,2)`, heading `0`; distance vs reference ≈ 0).
6. `npm run build` completes with no type/lint errors.
