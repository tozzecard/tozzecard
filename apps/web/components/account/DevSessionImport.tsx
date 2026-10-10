"use client";
import { type FormEvent, useState } from "react";
import { STORAGE } from "../../lib/storage";

/**
 * Development only: take a session copied from app.tozzecard.xyz so localhost shows the real card.
 * Passkeys are bound to the hostname, so the production card cannot sign in on localhost; its API
 * token can, because the API's CORS allows localhost:3000. On app.tozzecard.xyz, run
 * `copy(localStorage.getItem("tozzecard.session.v1"))` in the console, then paste it here.
 * A paste field rather than a clipboard read: browsers (Brave among them) refuse clipboard reads
 * without a prompt the user may never see, while Cmd+V into a field always works.
 * Never rendered in a production build.
 */
export function DevSessionImport() {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  if (process.env.NODE_ENV !== "development") return null;

  const use = (e: FormEvent) => {
    e.preventDefault();
    try {
      const s = JSON.parse(text.trim()) as { token?: unknown; address?: unknown };
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
      setNote(`Using ${s.address.slice(0, 6)}…${s.address.slice(-4)}`);
      window.location.assign("/home");
    } catch (err) {
      setNote(err instanceof SyntaxError ? "Paste the whole {…} you copied." : String(err));
    }
  };

  return (
    <form
      onSubmit={use}
      className="mt-4 rounded-[16px] border border-dashed border-line-2 px-4 py-3"
    >
      <div className="text-[13.5px] font-semibold">Use a production session (dev)</div>
      <p className="mt-1 text-[11.5px] text-muted">
        On app.tozzecard.xyz: copy(localStorage.getItem("tozzecard.session.v1")), then paste below.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"token":"…","address":"0x…"}'
          aria-label="Session"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 font-mono text-[12px] outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-10 shrink-0 rounded-xl bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Use
        </button>
      </div>
      {note ? <p className="mt-2 text-[12px] text-ink-2">{note}</p> : null}
    </form>
  );
}
