# Lunar NLP Mission Log Trainer — Web App

Week 1 frontend migration of the Streamlit prototype
(`../Original_by_Rushiil/nlp_analysis.py`) to a standalone **Next.js (App Router)**
web app. Students need no local Python install; the numeric core (2D path simulator
and command comparison) is ported to TypeScript.

## Getting started

```bash
npm run dev      # start the dev server at http://localhost:3000
npm run build    # production build
npm test         # run the simulator parity tests (vitest)
```

Then open <http://localhost:3000> and click **Start the mission**, or go straight to
`/steps/1` … `/steps/6` via the sidebar.

> **Note on Turbopack:** `next dev`/`next build` default to Turbopack, which currently
> segfaults on this machine (a Turbopack native crash, unrelated to the app code). The
> `dev` and `build` scripts therefore pass `--webpack`. If a future Next.js release fixes
> the crash, drop the `--webpack` flags to use the faster Turbopack path.

## Structure

```
src/
  app/
    layout.tsx            # root layout: header + <MissionProvider>
    page.tsx              # landing / mission intro
    steps/
      layout.tsx          # sidebar nav + <main>
      page.tsx            # redirects /steps -> /steps/1
      [n]/page.tsx        # renders the step component for n = 1..6
  components/
    Sidebar.tsx           # step navigation (replaces st.sidebar.radio)
    steps/Step1..6*.tsx   # one component per prototype step
    ui/                   # Callout, CodeBlock, Fields, DistanceResult
  lib/nlp/
    data.ts               # mission logs, reference commands, lookup tables, LLM prompt
    simulator.ts          # parseSynonyms, simulatePath, comparePaths
    simulator.test.ts     # parity tests vs the Python original
  state/
    MissionContext.tsx    # shared cross-step state (mirrors st.session_state),
                          # persisted to sessionStorage
```

## Scope

Week 1 is a faithful port of the six-step guided flow. The trainable model /
TensorFlow.js work is Week 2+. Step 6 does **not** make a live LLM API call — students
paste an LLM's output for comparison, matching the prototype.
