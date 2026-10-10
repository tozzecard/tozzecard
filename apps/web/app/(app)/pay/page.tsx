"use client";
import { paymentHeader, transferAuthorization } from "@tozzecard/binance/eip3009";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { formatUnits } from "viem";
import { Button, Card, SuccessCheck } from "../../../components/ui";
import { useCard } from "../../../hooks/useCard";
import { useMode } from "../../../hooks/useMode";
import { API_URL, bscscanTx } from "../../../lib/api";
import { usd } from "../../../lib/format";
import { passkeyError } from "../../../lib/passkey";

interface Order {
  id: string;
  amount: string;
  description: string;
  status: "open" | "paid";
  tx: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: x402 PaymentRequirements, passed through unchanged
type Requirement = any;

const payUrl = (id: string) => `${API_URL}/merchant/orders/${id}/pay`;
/** USD1 has 18 decimals. */
const toUsd = (amount: string) => Number(formatUnits(BigInt(amount), 18));

/**
 * Paying a merchant through B402 (plan §3.2): the merchant answers 402 with what it accepts, the
 * card signs one EIP-3009 authorization after Face ID, and the merchant settles it through B402,
 * which pays the gas. The card never holds BNB. Without `?order=`, this is the demo merchant's till.
 */
function Pay() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("order");
  const { unlock } = useCard();
  const { setMode } = useMode();
  // Pay is the card's tab: reaching it puts the app in card mode.
  useEffect(() => setMode("card"), [setMode]);
  const [order, setOrder] = useState<Order | null>(null);
  const [req, setReq] = useState<Requirement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("2.50");

  const load = useCallback(async (id: string) => {
    setError(null);
    const o = await fetch(`${API_URL}/merchant/orders/${id}`);
    if (o.status === 404) throw new Error("The demo merchant is not open right now.");
    const next = (await o.json()) as Order;
    setOrder(next);
    if (next.status === "paid") return;
    const r = await fetch(payUrl(id));
    const body = (await r.json()) as { accepts?: Requirement[]; error?: string };
    if (!body.accepts?.[0]) throw new Error(body.error ?? "The merchant sent no payment terms.");
    setReq(body.accepts[0]);
  }, []);

  useEffect(() => {
    if (orderId) load(orderId).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [orderId, load]);

  const createOrder = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/merchant/orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount, description: "Coffee" }),
      });
      if (res.status === 404) throw new Error("The demo merchant is not open right now.");
      const created = (await res.json()) as Order & { error?: string };
      if (!res.ok) throw new Error(created.error ?? "Could not create the order.");
      router.replace(`/pay?order=${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!order || !req) return;
    setBusy(true);
    setError(null);
    try {
      const account = await unlock();
      const { authorization, typedData } = transferAuthorization(req, account.address);
      const signature = await account.signTypedData(typedData);
      const res = await fetch(payUrl(order.id), {
        method: "POST",
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader(payUrl(order.id), req, authorization, signature),
        },
      });
      const body = (await res.json()) as Order & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The payment did not go through.");
      setOrder(body);
    } catch (err) {
      setError(passkeyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!orderId) {
    return (
      <form onSubmit={createOrder} className="mx-auto flex w-full max-w-[560px] flex-col">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Demo merchant</h1>
        <p className="mt-1 text-[14px] text-muted">
          Create an order, then pay it with your card. Real USD1 on BNB Chain.
        </p>
        <label htmlFor="amount" className="mt-8 text-[13px] font-medium text-muted">
          Amount (USD1)
        </label>
        <input
          id="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="mt-2 h-14 rounded-2xl border border-line bg-white px-4 text-2xl font-semibold tabular-nums outline-none focus:border-ink"
        />
        <div className="pt-8">
          {error ? <p className="mb-3 text-center text-[13px] text-neg">{error}</p> : null}
          <Button type="submit" disabled={busy || !(Number(amount) > 0)}>
            {busy ? "Creating…" : "Create order"}
          </Button>
        </div>
      </form>
    );
  }

  const link = typeof window === "undefined" ? "" : window.location.href;
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col">
      {order?.status === "paid" ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <SuccessCheck size={56} className="text-pos" />
          <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.03em]">
            Paid {usd(toUsd(order.amount))}
          </h1>
          <p className="mt-1 text-[14px] text-muted">No BNB used. Binance paid the network fee.</p>
          {order.tx ? (
            <a
              href={bscscanTx(order.tx)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 text-[14px] font-medium underline underline-offset-2"
            >
              View on BscScan
            </a>
          ) : null}
          <div className="mt-10 w-full">
            <Button type="button" onClick={() => router.push("/home")}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Card className="mt-6 px-5 py-6 text-center">
            <div className="text-[13px] font-medium text-muted">
              {order?.description || "Order"}
            </div>
            <div className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {order ? usd(toUsd(order.amount)) : "…"}
            </div>
            <div className="mt-2 text-[13px] text-muted">USD1 · paid through B402</div>
          </Card>
          {link ? (
            <div className="mx-auto mt-6 rounded-[20px] border border-line bg-white p-4">
              <QRCode value={link} size={148} />
            </div>
          ) : null}
          <p className="mt-2 text-center text-[12px] text-faint">Scan to pay from another phone</p>
          <div className="pt-8">
            {error ? <p className="mb-3 text-center text-[13px] text-neg">{error}</p> : null}
            <Button type="button" onClick={() => void pay()} disabled={busy || !req}>
              {busy ? "Waiting for Face ID…" : "Pay with Face ID"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={null}>
      <Pay />
    </Suspense>
  );
}
