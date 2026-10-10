"use client";
import { useContext } from "react";
import { ModeContext } from "../providers/ModeProvider";

/** Card or agent wallet mode, shared across Home, the bottom bar and the desktop bar. */
export function useMode() {
  const value = useContext(ModeContext);
  if (!value) throw new Error("useMode needs ModeProvider.");
  return value;
}
