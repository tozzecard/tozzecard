"use client";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE } from "../lib/storage";

export type Mode = "card" | "agent";

export const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void } | null>(null);

/**
 * Which half of the app is in front: the card (Home | Pay | Account) or the agent wallet
 * (Home | Strategy | Account). Shared so the switch on Home, the bottom bar and the desktop bar
 * agree, and remembered on this device.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("card");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE.mode) === "agent") setModeState("agent");
    } catch {}
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE.mode, m);
    } catch {}
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
