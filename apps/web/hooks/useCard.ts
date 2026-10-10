"use client";
import { useContext } from "react";
import { CardContext } from "../providers/CardProvider";

/** The signed-in card: session, the unlocked key, and create / sign-in / sign-out. */
export function useCard() {
  const value = useContext(CardContext);
  if (!value) throw new Error("useCard needs CardProvider.");
  return value;
}
