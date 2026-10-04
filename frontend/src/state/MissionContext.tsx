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
import {
  DEFAULT_ACTIONS,
  DEFAULT_AMOUNTS,
  DEFAULT_LANDMARKS,
  DEFAULT_LEFT_SYNONYMS,
  DEFAULT_MOVE_SYNONYMS,
  DEFAULT_RIGHT_SYNONYMS,
  DEFAULT_TURN_SYNONYMS,
  SAMPLE_MISSION_LOG,
} from "@/lib/nlp/data";

export interface MissionState {
  mission_log_1: string;
  actions_list: string;
  amounts_list: string;
  landmarks_list: string;
  student_commands_1: string;
  move_synonyms: string;
  turn_synonyms: string;
  left_synonyms: string;
  right_synonyms: string;
  student_dict_notes: string;
  student_new_commands: string;
  llm_commands_new: string;
}

const DEFAULTS: MissionState = {
  mission_log_1: SAMPLE_MISSION_LOG,
  actions_list: DEFAULT_ACTIONS,
  amounts_list: DEFAULT_AMOUNTS,
  landmarks_list: DEFAULT_LANDMARKS,
  student_commands_1: "",
  move_synonyms: DEFAULT_MOVE_SYNONYMS,
  turn_synonyms: DEFAULT_TURN_SYNONYMS,
  left_synonyms: DEFAULT_LEFT_SYNONYMS,
  right_synonyms: DEFAULT_RIGHT_SYNONYMS,
  student_dict_notes: "",
  student_new_commands: "",
  llm_commands_new: "",
};

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
  // server and client markup match.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MissionState>;
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // sessionStorage may be unavailable (private mode, SSR) — ignore.
    }
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

  const reset = () => setState(DEFAULTS);

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
