"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button, Toast } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useCard } from "../hooks/useCard";
import type { Market } from "../lib/api";
import { until, usd } from "../lib/format";
import { passkeyError } from "../lib/passkey";
import { STORAGE } from "../lib/storage";
import styles from "./Onboarding.module.css";

type TourScreen = {
  title: string;
  body: string;
  visual: ReactNode;
};

/** Three beats, in the order the product works: hold stocks, the agent fills the card, pay. */
const TOUR: TourScreen[] = [
  {
    title: "Your stocks,\nyour wallet",
    body: "Tokenized stocks in your own Binance wallet. Nobody holds them but you",
    visual: <StocksVisual />,
  },
  {
    title: "An agent fills\nyour card",
    body: "It sells a little of what grew most, while the market is open",
    visual: <MarketVisual />,
  },
  {
    title: "Pay with\nFace ID",
    body: "Your card holds dollars. Binance pays the network fee, so you never need BNB",
    visual: <CardVisual />,
  },
];

/** The API accepts A–Z, space, . ' - and up to 26 characters (apps/api card.ts cleanHolder). */
const cleanHolder = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z .'-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 26);

export default function Onboarding() {
  const router = useRouter();
  const { hydrated, session } = useCard();
  const [mode, setMode] = useState<"tour" | "create" | null>(null);
  const [step, setStep] = useState(0);

  // A returning card skips onboarding. `replace` keeps `/` out of history.
  useEffect(() => {
    if (hydrated && session) router.replace("/home");
  }, [hydrated, session, router]);

  useEffect(() => {
    if (!hydrated || session) return;
    let next: "tour" | "create" = "tour";
    try {
      next = window.localStorage.getItem(STORAGE.onboardingDone) === "1" ? "create" : "tour";
    } catch {
      next = "tour";
    }
    const id = window.setTimeout(() => setMode(next), 0);
    return () => window.clearTimeout(id);
  }, [hydrated, session]);

  if (!hydrated || session || mode === null) return <SplashScreen />;

  const finishTour = () => {
    try {
      window.localStorage.setItem(STORAGE.onboardingDone, "1");
    } catch {
      /* storage can be unavailable; still let the user continue */
    }
    setMode("create");
  };

  if (mode === "create") return <CreateScreen onBack={() => setMode("tour")} />;

  const last = step === TOUR.length - 1;
  const t = TOUR[step];

  return (
    <main className={`${styles.screen} ${styles.tourScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          {step > 0 ? (
            <BackButton onClick={() => setStep(step - 1)} />
          ) : (
            <span aria-hidden="true" className={styles.headerSpacer} />
          )}
          <BrandMark compact />
          <button type="button" className={styles.skipButton} onClick={finishTour}>
            Skip
          </button>
        </header>

        <section className={styles.tourBody}>
          <div key={step} className={styles.visualStage}>
            {t.visual}
          </div>
          <div className={styles.tourCopy}>
            <h1 className={styles.tourTitle}>{t.title}</h1>
            <p className={styles.tourText}>{t.body}</p>
            <Stepper current={step} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          <Button onClick={() => (last ? finishTour() : setStep(step + 1))}>
            {last ? "Continue" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}

/** The last screen: make a card with a passkey, or sign back in with one. */
function CreateScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { create, signIn } = useCard();
  const [naming, setNaming] = useState(false);
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const run = async (kind: "create" | "signin", fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      router.replace("/home");
    } catch (e) {
      setError(passkeyError(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (holder.trim().length < 2) return setError("Type the name for your card.");
    void run("create", () => create(holder.trim()));
  };

  return (
    <main className={`${styles.screen} ${styles.tourScreen} ${styles.connectScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          <BackButton onClick={naming ? () => setNaming(false) : onBack} />
          <BrandMark compact />
          <span aria-hidden="true" className={styles.headerSpacer} />
        </header>

        <section className={styles.tourBody}>
          <div key="create" className={`${styles.visualStage} ${styles.connectVisualStage}`}>
            <div className={styles.connectVisual} aria-hidden="true">
              <StockFloat ticker="MSFT" />
              <StockFloat ticker="TSLA" />
              <StockFloat ticker="AAPL" />
              <StockFloat ticker="NVDA" />
              <span className={styles.walletShadow} />
            </div>
          </div>
          <div className={styles.tourCopy}>
            <h1>{naming ? "Name your card" : "Create your card"}</h1>
            <p>
              {naming
                ? "It goes on the card face. You can change it later."
                : "Face ID only. No seed phrase, no wallet to install."}
            </p>
            <Stepper current={TOUR.length} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          {naming ? (
            <form onSubmit={submit}>
              <input
                aria-label="Name on the card"
                value={holder}
                onChange={(e) => setHolder(cleanHolder(e.target.value))}
                placeholder="ALEX LEE"
                autoComplete="name"
                // biome-ignore lint/a11y/noAutofocus: the only field on this step
                autoFocus
                className={styles.nameField}
              />
              <Button type="submit" disabled={busy !== null}>
                {busy === "create" ? "Waiting for Face ID…" : "Continue with Face ID"}
              </Button>
            </form>
          ) : (
            <>
              <Button onClick={() => setNaming(true)} disabled={busy !== null}>
                Create your card
              </Button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => void run("signin", signIn)}
                disabled={busy !== null}
              >
                {busy === "signin" ? "Waiting for Face ID…" : "I already have a card"}
              </button>
            </>
          )}
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className={`${styles.screen} ${styles.splashScreen}`} aria-label="Loading Tozzecard">
      <BrandMark />
      <span className={styles.splashPulse} aria-hidden="true" />
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Back" onClick={onClick} className={styles.backButton}>
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}>
      <Image
        src="/tozzecard-icon.svg"
        alt="Tozzecard"
        width={512}
        height={512}
        className={styles.brandLogo}
        priority
      />
    </div>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div
      className={styles.stepper}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Onboarding step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
        <span key={i} className={i === current ? styles.stepActive : ""} />
      ))}
    </div>
  );
}

/** A stock's mark from public/stocks. Amazon's mark is white, so it sits on a dark tile. */
function StockLogo({ ticker }: { ticker: string }) {
  return (
    <span className={`${styles.stockTile} ${ticker === "AMZN" ? styles.stockTileDark : ""}`}>
      {/* biome-ignore lint/performance/noImgElement: tiny static mark that must paint with the step */}
      <img src={`/stocks/${ticker}.png`} alt="" />
    </span>
  );
}

function StockFloat({ ticker }: { ticker: "NVDA" | "AAPL" | "MSFT" | "TSLA" }) {
  return (
    <span className={`${styles.walletFloat} ${styles[`stock${ticker}`]}`}>
      {/* biome-ignore lint/performance/noImgElement: tiny static mark that must paint with the step */}
      <img src={`/stocks/${ticker}.png`} alt="" className={styles.walletIconImage} />
    </span>
  );
}

const SHOWN = [
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "AAPL", name: "Apple" },
  { ticker: "MSFT", name: "Microsoft" },
];

/** Three stocks the agent can hold, at their live on-chain price (GET /market, Ondo). */
function StocksVisual() {
  const { data } = useApi<Market[]>("/market", 60_000);
  return (
    <div className={styles.assetStack} aria-hidden="true">
      {SHOWN.map((s, i) => {
        const m = data?.find((x) => x.symbol === `${s.ticker}on`);
        return (
          <div
            key={s.ticker}
            className={`${styles.assetRow} ${i === 0 ? styles.assetRowActive : ""}`}
          >
            <StockLogo ticker={s.ticker} />
            <span className={styles.assetText}>
              <strong>{s.name}</strong>
              <span className={styles.assetChain}>{s.ticker}on · Ondo</span>
            </span>
            <span className={styles.assetValue}>
              <b>{m ? usd(m.tokenPrice) : "…"}</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The New York clock the agent trades by, live from GET /market/SPYon. */
function MarketVisual() {
  const { data } = useApi<Market>("/market/SPYon", 60_000);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const open = data?.status.marketStatus === "regular";
  const next = open ? data?.status.nextCloseTime : data?.status.nextOpenTime;
  const bars = [28, 34, 42, 49, 55, 62, 68, 73, 79, 84, 89, 94];
  return (
    <div className={styles.chartPanel} aria-hidden="true">
      <div className={styles.chartHeader}>
        <div>
          <span>New York market</span>
          <strong>{data ? (open ? "Open" : "Closed") : "…"}</strong>
        </div>
        <b>{next && now ? `${open ? "closes" : "opens"} in ${until(next, now)}` : ""}</b>
      </div>
      <div className={styles.earningBars}>
        {bars.map((height, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
          <span key={i} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

/** The card and the one thing a holder does with it: pay, confirmed with Face ID. */
function CardVisual() {
  return (
    <div className={styles.agentPanel} aria-hidden="true">
      <div className={styles.phoneMock}>
        <div className={styles.phoneIsland} />
        <div className={styles.phoneContent}>
          <div className={styles.homeHeroMini}>
            <span>Ready to spend</span>
            <b>USD1</b>
            <em>on BNB Chain</em>
          </div>
          <div className={styles.homeButtonMini}>Pay</div>
          <span className={styles.homeSectionMini}>Your card</span>
          <div className={styles.cardMini}>
            <span className={styles.cardMiniChip} />
            <b>Tozzecard</b>
            <em>•••• •••• •••• ••••</em>
          </div>
        </div>
      </div>
      <div className={styles.safeExitCard}>
        <span className={styles.safeExitIcon}>
          <svg
            aria-hidden="true"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className={styles.safeExitText}>
          <strong>Paid with Face ID</strong>
          <span>No BNB needed</span>
        </div>
        <b>B402</b>
      </div>
    </div>
  );
}
