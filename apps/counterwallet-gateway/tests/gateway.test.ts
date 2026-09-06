import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest, type Env } from "../src/index";

function environment(
  response?: Response | ((request: Request) => Response | Promise<Response>),
  calls: Request[] = []
): Env {
  return {
    XCPDEX_API: {
      fetch: async (request: Request) => {
        calls.push(request);
        if (typeof response === "function") return response(request);
        return response?.clone() ?? Response.json({ ok: true });
      },
      connect: () => {
        throw new Error("not implemented");
      },
    },
  };
}

test("serves an allowlisted API endpoint through the service binding", async () => {
  const calls: Request[] = [];
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/coinmarketcap/summary?limit=10"),
    environment(Response.json({ data: [] }), calls)
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.xcpdex.com/coinmarketcap/summary?limit=10");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("x-counterwallet-gateway"), "1");
});

test("serves versioned aliases without changing the upstream API paths", async () => {
  const calls: Request[] = [];
  await handleRequest(
    new Request("https://api.counterwallet.io/api/v1/coingecko/orderbook?ticker_id=XCP_BTC"),
    environment(undefined, calls)
  );

  assert.equal(
    calls[0].url,
    "https://api.xcpdex.com/coingecko/orderbook?ticker_id=XCP_BTC"
  );
});

test("proxies CoinMarketCap pair path parameters through versioned aliases", async () => {
  const calls: Request[] = [];
  await handleRequest(
    new Request("https://api.counterwallet.io/api/v1/coinmarketcap/trades/XCP_BTC"),
    environment(undefined, calls)
  );

  assert.equal(calls[0].url, "https://api.xcpdex.com/coinmarketcap/trades/XCP_BTC");
});

test("normalizes trailing slashes on allowlisted API endpoints", async () => {
  const calls: Request[] = [];
  await handleRequest(
    new Request("https://api.counterwallet.io/coingecko/tickers/"),
    environment(undefined, calls)
  );

  assert.equal(calls[0].url, "https://api.xcpdex.com/coingecko/tickers");
});

test("rewrites the OpenAPI identity and server to the official hostname", async () => {
  const upstream = Response.json({ openapi: "3.1.0", info: { title: "upstream", description: "Market data." }, servers: [{ url: "https://api.xcpdex.com" }] }, {
    headers: { "cache-control": "public, max-age=60" },
  });
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/openapi.json"),
    environment(upstream)
  );

  assert.deepEqual(await response.json(), {
    openapi: "3.1.0",
    info: {
      title: "Counterparty DEX Market Data API",
      description: "Market data. Official Counterwallet-domain distribution for settled Counterparty DEX market data.",
      contact: { name: "Counterparty", url: "https://counterparty.io" },
    },
    servers: [
      { url: "https://api.counterwallet.io/api/v1", description: "Official versioned gateway" },
      { url: "https://api.counterwallet.io", description: "Backward-compatible unversioned routes" },
    ],
  });
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
});

test("publishes an official-domain machine-readable manifest", async () => {
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/.well-known/counterparty-market-data.json"),
    environment()
  );
  const manifest = await response.json() as {
    canonical_origin: string;
    profiles: { coinmarketcap: { policy: string } };
  };

  assert.equal(response.status, 200);
  assert.equal(manifest.canonical_origin, "https://api.counterwallet.io");
  assert.equal(/assets CoinMarketCap already lists/.test(manifest.profiles.coinmarketcap.policy), true);
});

test("serves response-shaped API documentation separately from the landing page", async () => {
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/docs"),
    environment()
  );

  assert.equal(response.status, 200);
  assert.equal(/^text\/html/.test(response.headers.get("content-type") ?? ""), true);
  const body = await response.text();
  assert.equal(/API reference/.test(body), true);
  assert.equal(/&quot;trading_pairs&quot;/.test(body), false);
  assert.equal(/"trading_pairs": "XCP_BTC"/.test(body), true);
  assert.equal(/liquidity_in_usd/.test(body), true);
});

test("renders the reviewer status page with every CMC asset and market", async () => {
  const calls: Request[] = [];
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/status"),
    environment((request) => {
      if (request.url.endsWith("/status")) {
        return Response.json({ ok: true, mode: "FOLLOWING", indexer: { last_block_index: "900000" } });
      }
      if (request.url.endsWith("/coinmarketcap/assets")) {
        return Response.json({ XCP: { name: "Counterparty", unified_cryptoasset_id: 132, can_deposit: true, can_withdraw: true, asset_url: "https://xcp.io/asset/XCP" } });
      }
      if (request.url.endsWith("/coinmarketcap/ticker")) {
        return Response.json({ XCP_BTC: { base_currency: "XCP", quote_currency: "BTC", last_price: "0.00006", quote_volume: "0.01", isFrozen: 0, last_trade_timestamp: 1_788_355_194_000 } });
      }
      return Response.json([{ ticker_id: "XCP_BTC", market_url: "https://xcpdex.com/limit/XCP/BTC", consumers: ["coinmarketcap"], status: "active" }]);
    }, calls)
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 4);
  const body = await response.text();
  assert.equal(/^text\/html/.test(response.headers.get("content-type") ?? ""), true);
  assert.equal(/Listed assets \(1\)/.test(body), true);
  assert.equal(/Counterparty/.test(body), true);
  assert.equal(/https:\/\/xcpdex\.com\/limit\/XCP\/BTC/.test(body), true);
});

test("proxies machine-readable health separately from the reviewer page", async () => {
  const calls: Request[] = [];
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/status.json"),
    environment(Response.json({ ok: true, mode: "FOLLOWING" }), calls)
  );

  assert.equal(response.status, 200);
  assert.equal(calls[0].url, "https://api.xcpdex.com/status");
  assert.deepEqual(await response.json(), { ok: true, mode: "FOLLOWING" });
});

test("answers API preflight locally", async () => {
  const calls: Request[] = [];
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/api/v1/coinmarketcap/summary", { method: "OPTIONS" }),
    environment(undefined, calls)
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");
  assert.equal(calls.length, 0);
});

test("serves the reviewer-facing index at the API root", async () => {
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/"),
    environment()
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(/Counterparty DEX market data/.test(body), true);
  assert.equal(/current and historical Counterparty DEX data/i.test(body), true);
  assert.equal(/\/api\/v1\/coinmarketcap\/summary/.test(body), true);
  assert.equal(/"trading_pairs"/.test(body), false);
});

test("returns a useful API 404 for unknown paths", async () => {
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/not-an-endpoint"),
    environment()
  );

  assert.equal(response.status, 404);
  assert.equal((await response.json() as { docs: string }).docs, "https://api.counterwallet.io/docs");
});

test("does not redirect unsupported methods to another origin", async () => {
  const response = await handleRequest(
    new Request("https://api.counterwallet.io/legacy", { method: "POST" }),
    environment()
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});
