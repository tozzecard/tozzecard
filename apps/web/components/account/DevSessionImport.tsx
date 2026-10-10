"use client";
import { useState } from "react";
import { STORAGE } from "../../lib/storage";

/**
 * Development only: take a session copied from app.tozzecard.xyz so localhost shows the real card.
 * Passkeys are bound to the hostname, so the production card cannot sign in on localhost; its API
 * token can, because the API's CORS allows localhost:3000. On app.tozzecard.xyz, run
 * `copy(localStorage.getItem("tozzecard.session.v1"))` in the console, then press this button.
 * Never rendered in a production build.
 */
export function DevSessionImport() {
  const [note, setNote] = useState<string | null>(null);
  if (process.env.NODE_ENV !== "development") return null;

  const use = async () => {
    try {
      const raw = (await navigator.clipboard.readText()).trim();
      const s = JSON.parse(raw) as { token?: unknown; address?: unknown };
      if (
        typeof s.token !== "string" ||
        !/^[0-9a-f]{64}$/.test(s.token) ||
        typeof s.address !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(s.address)
      )
        throw new Error("That isn't a Tozzecard session.");
      window.localStorage.setItem(
        STORAGE.session,
        JSON.stringify({ token: s.token, address: s.address }),
      );
      window.location.assign("/home");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Copy the session on app.tozzecard.xyz first.");
    }
  };

  return (
    <div className="mt-4 rounded-[16px] border border-dashed border-line-2 px-4 py-3 text-center">
      <button type="button" onClick={() => void use()} className="text-[13.5px] font-semibold">
        Use session from clipboard (dev)
      </button>
      <p className="mt-1 text-[11.5px] text-muted">
        {note ?? 'On app.tozzecard.xyz: copy(localStorage.getItem("tozzecard.session.v1"))'}
      </p>
    </div>
  );
}
