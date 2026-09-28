import { expect, test } from "bun:test";
import { BinanceApiError, createClient, preHash, queryString, sign } from "./index";

// The GET example from https://web3.binance.com/en/dev-docs/authentication
const DOC_PREHASH =
  "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";

test("preHash matches the documented example", () => {
  const path = `/build/api/v1/dex/market/price${queryString({ chainId: 1, symbol: "ETH USDT" })}`;
  expect(preHash("2026-05-11T10:08:57.715Z", "get", path)).toBe(DOC_PREHASH);
});

test("sign is base64 HMAC-SHA256 (checked against openssl)", () => {
  expect(sign("test-secret", DOC_PREHASH)).toBe("+e4H3erFq96IQ1yTqE+vjaHHmLdSy+rOmPqIo2kR5OA=");
});

test("client signs the /build path and unwraps data", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const client = createClient({
    apiKey: "k",
    secret: "s",
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ code: 0, msg: "success", data: [1], success: true }));
    }) as typeof fetch,
  });

  expect(
    await client.get<number[]>("/api/v1/dex/market/rwa/tokens", { binanceChainId: "56" }),
  ).toEqual([1]);
  const [{ url, headers: h }] = calls;
  expect(url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/tokens?binanceChainId=56");
  const expected = sign(
    "s",
    preHash(h["X-OC-TIMESTAMP"], "GET", new URL(url).pathname + new URL(url).search),
  );
  expect(h["X-OC-SIGN"]).toBe(expected);
  expect(h["X-OC-APIKEY"]).toBe("k");
});

test("client throws BinanceApiError on a non-zero code", async () => {
  const client = createClient({
    apiKey: "k",
    secret: "s",
    fetch: (async () =>
      new Response(JSON.stringify({ code: 40102, msg: "Invalid sign", success: false }), {
        status: 401,
      })) as unknown as typeof fetch,
  });
  const err = (await client.get("/x").catch((e) => e)) as BinanceApiError;
  expect(err).toBeInstanceOf(BinanceApiError);
  expect(err.code).toBe(40102);
});
