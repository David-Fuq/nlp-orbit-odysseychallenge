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
  reset: () => void;
}

const MissionContext = createContext<MissionContextValue | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MissionState>(DEFAULTS);
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
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      } catch {
        // ignore
      }
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
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, hydrated]);

  const setField: MissionContextValue["setField"] = (key, value) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  // The job_id identifies this tab's model on the backend, so it outlives a reset.
  const reset = () => setState((prev) => ({ ...DEFAULTS, job_id: prev.job_id }));

  return (
    <MissionContext.Provider value={{ state, setField, reset }}>
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
