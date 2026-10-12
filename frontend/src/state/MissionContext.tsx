"use client";

// Shared cross-step state, mirroring the prototype's st.session_state.
// Persisted to sessionStorage so it survives navigation between steps.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULTS, restoreMissionState, type MissionState } from "./missionStorage";

export type { MissionState } from "./missionStorage";

const STORAGE_KEY = "orbit-odyssey-mission";

interface MissionContextValue {
  state: MissionState;
  setField: <K extends keyof MissionState>(key: K, value: MissionState[K]) => void;
  /**
   * Functional form of setField: `fn` receives the latest committed value, so
   * several updates fired before a re-render (e.g. streamed training metrics)
   * all apply instead of overwriting each other from a stale closure.
   */
  updateField: <K extends keyof MissionState>(
    key: K,
    fn: (prev: MissionState[K]) => MissionState[K],
  ) => void;
  /**
   * "Start over": a fresh session with a new job_id, saved immediately. The
   * old model is simply orphaned on the backend.
   */
  startOver: () => void;
}

const MissionContext = createContext<MissionContextValue | null>(null);

function persist(state: MissionState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable (private mode) — ignore.
  }
}

/**
 * `initialState` is what the first render (and so server rendering) shows
 * before the stored session loads; tests render steps with it.
 */
export function MissionProvider({
  children,
  initialState = DEFAULTS,
}: {
  children?: ReactNode;
  initialState?: MissionState;
}) {
  const [state, setState] = useState<MissionState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state once, after the initial (deterministic) render so
  // server and client markup match. This is also the only place job_id is
  // generated: never during render or SSR.
  useEffect(() => {
    let stored: unknown = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      // sessionStorage may be unavailable (private mode, SSR) or hold bad JSON — ignore.
    }
    const { state: restored, generated } = restoreMissionState(stored, DEFAULTS, () =>
      crypto.randomUUID(),
    );
    if (generated) {
      // Store a new id right away so a Strict Mode re-run of this effect reads
      // it back instead of generating a second one.
      persist(restored);
    }
    // Intentional: sessionStorage can't be read during render without a
    // server/client hydration mismatch, so this one-time post-mount sync
    // is the point of the effect, not a cascading-render accident.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(restored);
    setHydrated(true);
  }, []);

  // Persist on change, but only after hydration so we don't clobber stored
  // values with the defaults on first mount.
  useEffect(() => {
    if (!hydrated) return;
    persist(state);
  }, [state, hydrated]);

  const setField: MissionContextValue["setField"] = (key, value) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateField: MissionContextValue["updateField"] = (key, fn) => {
    setState((prev) => ({ ...prev, [key]: fn(prev[key]) }));
  };

  const startOver = () => {
    const fresh: MissionState = {
      ...DEFAULTS,
      labeled_examples: [...DEFAULTS.labeled_examples],
      job_id: crypto.randomUUID(),
    };
    // Saved now rather than by the effect, so a reload straight after
    // can't bring the old session back.
    persist(fresh);
    setState(fresh);
  };

  return (
    <MissionContext.Provider value={{ state, setField, updateField, startOver }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission(): MissionContextValue {
  const ctx = useContext(MissionContext);
  if (!ctx) {
    throw new Error("useMission must be used within a MissionProvider");
  }
  return ctx;
}
