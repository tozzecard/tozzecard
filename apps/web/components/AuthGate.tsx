"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useCard } from "../hooks/useCard";

/** Screens behind a card session. Waits for storage before deciding, so a reload never bounces. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { hydrated, session } = useCard();
  useEffect(() => {
    if (hydrated && !session) router.replace("/");
  }, [hydrated, session, router]);
  if (!hydrated || !session) return null;
  return <>{children}</>;
}
