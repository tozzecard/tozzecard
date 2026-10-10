"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useCard } from "./useCard";

/**
 * GET an API path, with the card's token when there is one, refreshed every `everyMs`.
 * `off` is true when the route returns 404: the API only mounts agent routes when the agent runs,
 * so a screen shows "not running" instead of an error. A 401 ends the session.
 */
export function useApi<T>(path: string | null, everyMs = 30_000) {
  const { session, signOut } = useCard();
  const token = session?.token ?? null;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [loading, setLoading] = useState(path !== null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const next = await api<T>(path, { token });
      if (!alive.current) return;
      setData(next);
      setError(null);
      setOff(false);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 404) setOff(true);
      else if (e instanceof ApiError && e.status === 401) void signOut();
      else setError(e instanceof Error ? e.message : "Could not reach Tozzecard.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path, token, signOut]);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(() => void load(), everyMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load, everyMs]);

  return { data, error, off, loading, reload: load };
}
