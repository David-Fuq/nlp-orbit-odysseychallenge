# Lunar NLP Mission Log Trainer — Web App

Week 1 frontend migration of the Streamlit prototype
(`../Original_by_Rushiil/nlp_analysis.py`) to a standalone **Next.js (App Router)**
web app. Students need no local Python install; the numeric core (2D path simulator
and command comparison) is ported to TypeScript.

## Getting started

```bash
npm run dev      # start the dev server at http://localhost:3000
npm run build    # production build
npm test         # run the unit tests (vitest)
```

Then open <http://localhost:3000> and click **Start the mission**, or go straight to
`/steps/1` … `/steps/6` via the sidebar.

> **Note on Turbopack:** `next dev`/`next build` default to Turbopack, which currently
> segfaults on this machine (a Turbopack native crash, unrelated to the app code). The
> `dev` and `build` scripts therefore pass `--webpack`. If a future Next.js release fixes
> the crash, drop the `--webpack` flags to use the faster Turbopack path.

## Backend connection

Training and prediction run on the FastAPI backend in `../backend` (see its
README). Start it in a second terminal, from `backend/`:

```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```

The frontend finds it through one variable, `NEXT_PUBLIC_API_BASE_URL`, read only in
`src/lib/nlp/config.ts`. The WebSocket URL is derived from it (`http` → `ws`,
`https` → `wss`). If the variable is unset it defaults to `http://localhost:8000`.

- `.env.example` (committed) documents the variable.
- `.env.local` (git-ignored) is your local copy: `cp .env.example .env.local`.

Next inlines `NEXT_PUBLIC_*` values when the dev server or build starts, so restart
`npm run dev` after changing it. The backend's CORS allows only
`http://localhost:3000`, so browse at `localhost`, not `127.0.0.1`.

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
    ui/                   # Callout, CodeBlock, Fields, DistanceResult,
                          # TrainingChart (+ chartGeometry: pure SVG coordinate math)
  lib/nlp/
    data.ts               # mission logs, reference commands, lookup tables, LLM prompt
    simulator.ts          # parseSynonyms, simulatePath, comparePaths
    simulator.test.ts     # parity tests vs the Python original
    config.ts             # backend base URL (NEXT_PUBLIC_API_BASE_URL) + derived WS URL
    api.ts                # typed client: startTraining, predict, getModelStatus,
                          # connectTrainingSocket (resolves on the socket's open event)
  state/
    MissionContext.tsx    # shared cross-step state (mirrors st.session_state),
                          # persisted to sessionStorage
```

## Scope

Week 1 is a faithful port of the six-step guided flow. The trainable model /
TensorFlow.js work is Week 2+. Step 6 does **not** make a live LLM API call — students
paste an LLM's output for comparison, matching the prototype.
