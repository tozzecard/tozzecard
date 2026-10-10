@AGENTS.md

# @tozzecard/landing

Next.js 16 (App Router, Turbopack) + React 18 + Tailwind 3. Marketing site for Tozzecard at
`tozzecard.xyz`. Owner: Axel.

```bash
bun run dev        # localhost:3001 (apps/web holds :3000)
bun run build
bun run typecheck
```

## Where this page stands

Copied whole from the frontend owner's earlier card project on 10 Oct 2026; layout, motion and
section structure carry over. **The copy is not Tozzecard's yet**: it still talks about a credit
card, collateral and another chain. Rewrite it around `docs/plan.md` §1 and §3 (agent wallet holds
stocks, card holds USD1, refill while the market is open, address book). The logo files in
`public/logo*` are placeholders from that project. The testimonials are placeholders.

## Shape of the page

`src/app/page.tsx` is a `"use client"` shell that renders `src/App.tsx`. The page opens on a
**scroll-locked hero**: nothing below it is mounted until the intro video has played. `curl` will
not find those sections; scroll once in a browser and wait about five seconds.

## Copy rules

- No em dashes.
- No technical talk in marketing copy. What happens to the reader's money, not how it is proved.
- A number on this page should be one a reader could go and check.
- Placeholder testimonials stay legible as placeholders (Doe, Acme, ...).

## Things that will bite you

- Video needs `muted` set through a ref, not only as a JSX prop, or autoplay is blocked.
- The top-up video has alpha: `.webm` (VP9) for Chrome/Firefox, `.mov` (HEVC) for Safari, chosen by
  engine, not by `<source>` order.
- File extensions must match the bytes; Next sets `Content-Type` from the extension.
- Hero and card imagery still load from a remote CDN with no local fallback.
- Do not bump React to 19 without checking `useInView` in `src/App.tsx`.
