import { handleOhlc } from "./routes/ohlc";
import { handleTrades } from "./routes/trades";
import { handlePair, handlePairs } from "./routes/pairs";
import { handleTrending } from "./routes/trending";
import { handleBook } from "./routes/book";
import { handleMarkets } from "./routes/markets";
import { handleAsset } from "./routes/asset";
import { handlePortfolioBids, handlePortfolioOrders } from "./routes/portfolio";
import { handleDispenserStats } from "./routes/dispenser-stats";
import { runIndexer } from "./indexer/ingest";
import { syncOrders } from "./indexer/orders";
import { aggregateCandlesForPair, runCatchupAggregation } from "./indexer/aggregate";
import { updatePairStats } from "./indexer/stats";
import { runDispenseIndexer } from "./indexer/dispenses";
import { syncDispensers } from "./indexer/dispensers";

export interface Env {
  DB: D1Database;
  CP_API_BASE: string;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route: GET /ohlc/:pair
      const ohlcMatch = path.match(/^\/ohlc\/([A-Za-z0-9._]+)$/);
      if (ohlcMatch) {
        return withCors(await handleOhlc(request, env.DB, ohlcMatch[1]));
      }

      // Route: GET /trades/:pair
      const tradesMatch = path.match(/^\/trades\/([A-Za-z0-9._]+)$/);
      if (tradesMatch) {
        return withCors(await handleTrades(request, env.DB, tradesMatch[1]));
      }

      // Route: GET /book/:pair
      const bookMatch = path.match(/^\/book\/([A-Za-z0-9._]+)$/);
      if (bookMatch) {
        return withCors(await handleBook(request, env.DB, bookMatch[1]));
      }

      // Route: GET /pair/:pair
      const pairMatch = path.match(/^\/pair\/([A-Za-z0-9._]+)$/);
      if (pairMatch) {
        return withCors(await handlePair(env.DB, pairMatch[1]));
      }

      // Route: GET /pairs
      if (path === "/pairs") {
        return withCors(await handlePairs(request, env.DB));
      }

      // Route: GET /markets
      if (path === "/markets") {
        return withCors(await handleMarkets(request, env.DB));
      }

      // Route: GET /trending
      if (path === "/trending") {
        return withCors(await handleTrending(env.DB));
      }

      // Route: GET /asset/:name
      const assetMatch = path.match(/^\/asset\/([A-Za-z0-9.]+)$/);
      if (assetMatch) {
        return withCors(await handleAsset(env.DB, assetMatch[1]));
      }

      // Route: GET /portfolio/:address/bids
      const portfolioBidsMatch = path.match(
        /^\/portfolio\/([A-Za-z0-9]+)\/bids$/
      );
      if (portfolioBidsMatch) {
        return withCors(
          await handlePortfolioBids(
            request,
            env.DB,
            env.CP_API_BASE,
            portfolioBidsMatch[1]
          )
        );
      }

      // Route: GET /portfolio/:address/orders
      const portfolioOrdersMatch = path.match(
        /^\/portfolio\/([A-Za-z0-9]+)\/orders$/
      );
      if (portfolioOrdersMatch) {
        return withCors(
          await handlePortfolioOrders(request, env.DB, portfolioOrdersMatch[1])
        );
      }

      // Route: GET /dispenser-stats/:asset
      const dispenserStatsMatch = path.match(/^\/dispenser-stats\/([A-Za-z0-9.]+)$/);
      if (dispenserStatsMatch) {
        return withCors(await handleDispenserStats(env.DB, dispenserStatsMatch[1]));
      }

      // Route: GET /status (health check / indexer status)
      if (path === "/status") {
        const state = await env.DB
          .prepare(`SELECT key, value FROM indexer_state`)
          .all<{ key: string; value: string }>();

        const tradeCount = await env.DB
          .prepare(`SELECT COUNT(*) as cnt FROM trades`)
          .first<{ cnt: number }>();

        const pairCount = await env.DB
          .prepare(`SELECT COUNT(*) as cnt FROM pair_stats`)
          .first<{ cnt: number }>();

        const openOrderCount = await env.DB
          .prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'open'`)
          .first<{ cnt: number }>();

        const dispenseCount = await env.DB
          .prepare(`SELECT COUNT(*) as cnt FROM dispenses`)
          .first<{ cnt: number }>();

        const openDispenserCount = await env.DB
          .prepare(`SELECT COUNT(*) as cnt FROM dispensers WHERE status = 0`)
          .first<{ cnt: number }>();

        return withCors(
          Response.json({
            ok: true,
            trades: tradeCount?.cnt ?? 0,
            pairs: pairCount?.cnt ?? 0,
            open_orders: openOrderCount?.cnt ?? 0,
            dispenses: dispenseCount?.cnt ?? 0,
            open_dispensers: openDispenserCount?.cnt ?? 0,
            indexer: Object.fromEntries(
              (state?.results ?? []).map((r) => [r.key, r.value])
            ),
          })
        );
      }

      // Rebuild candles + stats for a batch of pairs
      // POST /indexer/aggregate → run catch-up (uses internal offset tracking)
      // POST /indexer/aggregate?offset=0&limit=5 → manual batch at specific offset
      if (path === "/indexer/aggregate" && request.method === "POST") {
        const hasOffset = url.searchParams.has("offset");

        if (!hasOffset) {
          // Trigger catch-up aggregation (sets flag if not already set, then processes a batch)
          await env.DB
            .prepare(
              `INSERT INTO indexer_state (key, value) VALUES ('aggregation_offset', '0')
               ON CONFLICT (key) DO NOTHING`
            )
            .run();
          const result = await runCatchupAggregation(env.DB);
          return withCors(Response.json(result));
        }

        // Manual mode: specific offset + limit
        const offset = parseInt(url.searchParams.get("offset")!, 10);
        const limit = Math.min(
          parseInt(url.searchParams.get("limit") ?? "5", 10),
          10
        );
        const pairs = await env.DB
          .prepare(
            `SELECT pair, base_asset, quote_asset, first_trade_time
             FROM pair_stats
             ORDER BY pair LIMIT ? OFFSET ?`
          )
          .bind(limit, offset)
          .all<{
            pair: string;
            base_asset: string;
            quote_asset: string;
            first_trade_time: number | null;
          }>();

        for (const p of pairs.results) {
          const earliest = p.first_trade_time ?? 0;
          await aggregateCandlesForPair(env.DB, p.pair, earliest);
          await updatePairStats(env.DB, p.pair, p.base_asset, p.quote_asset);
        }

        return withCors(
          Response.json({
            aggregated: pairs.results.length,
            offset,
            pairs: pairs.results.map((p) => p.pair),
          })
        );
      }

      // Manual trigger for trade backfill
      if (path === "/indexer/run" && request.method === "POST") {
        const pages = parseInt(url.searchParams.get("pages") ?? "5", 10);
        const skipAgg = url.searchParams.get("aggregate") !== "true";
        const result = await runIndexer(
          env.DB,
          env.CP_API_BASE,
          Math.min(pages, 50),
          skipAgg
        );
        return withCors(Response.json(result));
      }

      // Manual trigger for dispense backfill
      if (path === "/indexer/run-dispenses" && request.method === "POST") {
        const pages = parseInt(url.searchParams.get("pages") ?? "5", 10);
        const skipStats = url.searchParams.get("stats") !== "true";
        const result = await runDispenseIndexer(
          env.DB,
          env.CP_API_BASE,
          Math.min(pages, 50),
          skipStats
        );
        return withCors(Response.json(result));
      }

      return withCors(
        Response.json({ error: "Not found" }, { status: 404 })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      console.error("Request error:", message, stack);
      return withCors(
        Response.json(
          { error: message, stack },
          { status: 500 }
        )
      );
    }
  },

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // 1. Ingest new trades + sync orders + dispenses + dispensers in parallel
        const [tradeResult, orderResult, dispenseResult, dispenserResult] = await Promise.allSettled([
          runIndexer(env.DB, env.CP_API_BASE, 50),
          syncOrders(env.DB, env.CP_API_BASE),
          runDispenseIndexer(env.DB, env.CP_API_BASE, 50),
          syncDispensers(env.DB, env.CP_API_BASE),
        ]);

        if (tradeResult.status === "fulfilled") {
          const r = tradeResult.value;
          console.log(`Trades: inserted=${r.inserted} pages=${r.pages} done=${r.done}`);
        } else {
          console.error("Trade indexer error:", tradeResult.reason);
        }

        if (orderResult.status === "fulfilled") {
          const r = orderResult.value;
          console.log(`Orders: synced=${r.synced} closed=${r.closed}`);
        } else {
          console.error("Order sync error:", orderResult.reason);
        }

        if (dispenseResult.status === "fulfilled") {
          const r = dispenseResult.value;
          console.log(`Dispenses: inserted=${r.inserted} pages=${r.pages} done=${r.done}`);
        } else {
          console.error("Dispense indexer error:", dispenseResult.reason);
        }

        if (dispenserResult.status === "fulfilled") {
          const r = dispenserResult.value;
          console.log(`Dispensers: synced=${r.synced} closed=${r.closed}`);
        } else {
          console.error("Dispenser sync error:", dispenserResult.reason);
        }

        // 2. Catch-up aggregation (runs after backfill until all pairs have candles)
        try {
          const agg = await runCatchupAggregation(env.DB);
          if (!agg.done) {
            console.log(`Catchup aggregation: processed=${agg.processed} offset=${agg.offset}`);
          }
        } catch (e) {
          console.error("Catchup aggregation error:", e);
        }
      })()
    );
  },
} satisfies ExportedHandler<Env>;
