/**
 * One row in the activity list, built from GET /me/activity (B402 payments and agent refills).
 *
 * `kind` is what `ActivityRow` titles and draws (`payment`, `refill`). `cat` stays because
 * `ActivityList` still renders the distinction: `you` paid, `auto` is the agent.
 */
export interface ActivityItem {
  id: number;
  cat: "you" | "auto";
  kind: string;
  detail: string;
  when: string;
  /** Epoch ms, what date grouping sorts and splits on. */
  at?: number;
  flag?: boolean;
  /** BscScan link for a row that came off the chain. */
  href?: string;
  group?: "card" | "deposit";
}
