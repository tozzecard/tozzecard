// Tozzecard work hook: no LLM. The deliverable is the refill decision our scheduler would make,
// read from the public Tozzecard API. Read-only: this agent never trades and holds no mainnet key.
const API = process.env.TOZZECARD_API ?? "https://api.tozzecard.xyz";

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(API + path, { signal });
  if (!res.ok) throw new Error(`Tozzecard API ${res.status} ${path}`);
  return res.json();
}

/** `prompt` may contain an ISO time ("2026-10-12T14:00:00Z") to preview; default is now. */
export async function tozzecardWork(
  prompt: string,
  opts: { abortSignal?: AbortSignal } = {},
): Promise<string> {
  const iso = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z/.exec(prompt)?.[0];
  const at = iso ?? new Date().toISOString();
  const [preview, session] = await Promise.all([
    get(`/agent/preview?at=${encodeURIComponent(at)}`, opts.abortSignal),
    get("/agent/session", opts.abortSignal),
  ]);
  return JSON.stringify({ service: "tozzecard-refill-decision", at, preview, session }, null, 2);
}
