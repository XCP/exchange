import { handleOhlc } from "./routes/ohlc";
import { handleTrades } from "./routes/trades";
import { handlePair, handlePairs } from "./routes/pairs";
import { handleTrending } from "./routes/trending";
import { handleBook } from "./routes/book";
import { handleMarkets } from "./routes/markets";
import { handleAsset } from "./routes/asset";
import { handlePortfolioBids, handlePortfolioDispensers, handlePortfolioOrders } from "./routes/portfolio";
import { handleDispenserStats } from "./routes/dispenser-stats";
import { syncBlocks } from "./indexer/sync-block";
import { runCatchupAggregation } from "./indexer/aggregate";
import { backfillTrades, backfillDispenses } from "./indexer/backfill";
import { syncOrders, syncDispensers, runSnapshotStep } from "./indexer/snapshot";
import { getMode, setMode, deleteState } from "./indexer/state";
import { aggregateCandlesForPair } from "./indexer/aggregate";
import { updatePairStats } from "./indexer/stats";

export interface Env {
  DB: D1Database;
  CP_API_BASE: string;
  INDEXER_TOKEN?: string;
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

    // Auth gate for internal indexer endpoints
    if (path.startsWith("/indexer/") && request.method === "POST") {
      if (!env.INDEXER_TOKEN) {
        return withCors(Response.json({ error: "INDEXER_TOKEN not configured" }, { status: 500 }));
      }
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.INDEXER_TOKEN}`) {
        return withCors(Response.json({ error: "Unauthorized" }, { status: 401 }));
      }
    }

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
        return withCors(await handleTrending(request, env.DB));
      }

      // Route: GET /asset/:name
      const assetMatch = path.match(/^\/asset\/([A-Za-z0-9._]+)$/);
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

      // Route: GET /portfolio/:address/dispensers
      const portfolioDispensersMatch = path.match(
        /^\/portfolio\/([A-Za-z0-9]+)\/dispensers$/
      );
      if (portfolioDispensersMatch) {
        return withCors(
          await handlePortfolioDispensers(
            request,
            env.DB,
            portfolioDispensersMatch[1]
          )
        );
      }

      // Route: GET /dispenser-stats/:asset
      const dispenserStatsMatch = path.match(/^\/dispenser-stats\/([A-Za-z0-9._]+)$/);
      if (dispenserStatsMatch) {
        return withCors(await handleDispenserStats(env.DB, dispenserStatsMatch[1]));
      }

      // Route: GET /status — mode, progress, table counts
      if (path === "/status") {
        const mode = await getMode(env.DB);

        const [tradeCount, pairCount, openOrderCount, dispenseCount, openDispenserCount, candleCount] =
          await Promise.all([
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades`).first<{ cnt: number }>(),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM pair_stats`).first<{ cnt: number }>(),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'open'`).first<{ cnt: number }>(),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM dispenses`).first<{ cnt: number }>(),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM dispensers WHERE status < 10`).first<{ cnt: number }>(),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM candles`).first<{ cnt: number }>(),
          ]);

        const state = await env.DB
          .prepare(`SELECT key, value FROM indexer_state`)
          .all<{ key: string; value: string }>();

        return withCors(
          Response.json({
            ok: true,
            mode,
            trades: tradeCount?.cnt ?? 0,
            pairs: pairCount?.cnt ?? 0,
            open_orders: openOrderCount?.cnt ?? 0,
            dispenses: dispenseCount?.cnt ?? 0,
            open_dispensers: openDispenserCount?.cnt ?? 0,
            candles: candleCount?.cnt ?? 0,
            indexer: Object.fromEntries(
              (state?.results ?? []).map((r) => [r.key, r.value])
            ),
          })
        );
      }

      // POST /indexer/start — IDLE → BACKFILL_TRADES
      if (path === "/indexer/start" && request.method === "POST") {
        const mode = await getMode(env.DB);
        if (mode !== "IDLE") {
          return withCors(
            Response.json({ error: `Cannot start: mode is ${mode}, expected IDLE` }, { status: 409 })
          );
        }
        // Clear any stale state from a previous aborted run before starting fresh
        await Promise.all([
          deleteState(env.DB, "backfill_total"),
          deleteState(env.DB, "backfill_offset"),
          deleteState(env.DB, "dispense_backfill_cursor"),
          deleteState(env.DB, "dispense_backfill_total"),
          deleteState(env.DB, "aggregation_offset"),
          deleteState(env.DB, "sync_lock"),
        ]);
        await setMode(env.DB, "BACKFILL_TRADES");
        return withCors(Response.json({ ok: true, mode: "BACKFILL_TRADES" }));
      }

      // POST /indexer/backfill?pages=20 — auto-detects current phase
      if (path === "/indexer/backfill" && request.method === "POST") {
        const pages = Math.min(
          parseInt(url.searchParams.get("pages") ?? "20", 10),
          50
        );
        const mode = await getMode(env.DB);

        switch (mode) {
          case "BACKFILL_TRADES": {
            const result = await backfillTrades(env.DB, env.CP_API_BASE, pages);
            return withCors(Response.json(result));
          }
          case "BACKFILL_DISPENSES": {
            const result = await backfillDispenses(env.DB, env.CP_API_BASE, pages);
            return withCors(Response.json(result));
          }
          case "SNAPSHOT_SYNC": {
            const result = await runSnapshotStep(env.DB, env.CP_API_BASE);
            return withCors(Response.json({ type: "snapshot", ...result }));
          }
          case "BUILD_AGGREGATES": {
            const result = await runCatchupAggregation(env.DB);
            return withCors(Response.json({ type: "aggregates", ...result }));
          }
          case "FOLLOWING":
            return withCors(Response.json({ done: true, mode: "FOLLOWING" }));
          default:
            return withCors(
              Response.json({ error: `Cannot backfill in mode: ${mode}` }, { status: 409 })
            );
        }
      }

      // POST /indexer/aggregate — manual aggregate trigger (any mode)
      if (path === "/indexer/aggregate" && request.method === "POST") {
        const hasOffset = url.searchParams.has("offset");

        if (!hasOffset) {
          await env.DB
            .prepare(
              `INSERT INTO indexer_state (key, value) VALUES ('aggregation_offset', '0')
               ON CONFLICT (key) DO NOTHING`
            )
            .run();
          const result = await runCatchupAggregation(env.DB);
          return withCors(Response.json(result));
        }

        const offset = parseInt(url.searchParams.get("offset")!, 10);
        const limit = Math.min(
          parseInt(url.searchParams.get("limit") ?? "100", 10),
          200
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

      // POST /indexer/sync?blocks=10 — manual block sync
      if (path === "/indexer/sync" && request.method === "POST") {
        const maxBlocks = Math.min(
          parseInt(url.searchParams.get("blocks") ?? "10", 10),
          50
        );
        const result = await syncBlocks(env.DB, env.CP_API_BASE, maxBlocks);
        return withCors(Response.json(result));
      }

      // POST /indexer/full-sync — re-snapshot orders+dispensers (recovery, any mode)
      if (path === "/indexer/full-sync" && request.method === "POST") {
        const [orderResult, dispenserResult] = await Promise.allSettled([
          syncOrders(env.DB, env.CP_API_BASE),
          syncDispensers(env.DB, env.CP_API_BASE),
        ]);
        return withCors(Response.json({
          orders: orderResult.status === "fulfilled" ? orderResult.value : { error: String(orderResult.reason) },
          dispensers: dispenserResult.status === "fulfilled" ? dispenserResult.value : { error: String(dispenserResult.reason) },
        }));
      }

      // POST /indexer/reset — reset to IDLE (for re-index)
      if (path === "/indexer/reset" && request.method === "POST") {
        await Promise.all([
          setMode(env.DB, "IDLE"),
          deleteState(env.DB, "backfill_total"),
          deleteState(env.DB, "backfill_offset"),
          deleteState(env.DB, "dispense_backfill_cursor"),
          deleteState(env.DB, "dispense_backfill_total"),
          deleteState(env.DB, "aggregation_offset"),
        ]);
        return withCors(Response.json({ ok: true, mode: "IDLE" }));
      }

      return withCors(
        Response.json({ error: "Not found" }, { status: 404 })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Request error:", message, e instanceof Error ? e.stack : "");
      return withCors(
        Response.json({ error: "Internal server error" }, { status: 500 })
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
        try {
          const mode = await getMode(env.DB);

          switch (mode) {
            case "IDLE":
              // Nothing to do — waiting for POST /indexer/start
              break;

            case "BACKFILL_TRADES": {
              const r = await backfillTrades(env.DB, env.CP_API_BASE, 50);
              console.log(`Cron: backfill trades — ${r.inserted} inserted, ${r.progress}% done`);
              break;
            }

            case "BACKFILL_DISPENSES": {
              const r = await backfillDispenses(env.DB, env.CP_API_BASE, 50);
              console.log(`Cron: backfill dispenses — ${r.inserted} inserted, ${r.progress}% done`);
              break;
            }

            case "SNAPSHOT_SYNC": {
              const r = await runSnapshotStep(env.DB, env.CP_API_BASE, 20);
              console.log(`Cron: snapshot step=${r.step}`);
              break;
            }

            case "BUILD_AGGREGATES": {
              const r = await runCatchupAggregation(env.DB);
              console.log(`Cron: aggregation — processed=${r.processed}, done=${r.done}`);
              break;
            }

            case "FOLLOWING": {
              const sync = await syncBlocks(env.DB, env.CP_API_BASE, 10);
              if (sync.blocks_processed > 0) {
                console.log(
                  `Sync: ${sync.blocks_processed} blocks (${sync.last_block}/${sync.current_block}) ` +
                  `trades=${sync.trades_inserted} orders=+${sync.orders_upserted}/-${sync.orders_closed} ` +
                  `dispensers=+${sync.dispensers_upserted}/~${sync.dispensers_updated} ` +
                  `dispenses=${sync.dispenses_inserted}`
                );
              }
              break;
            }
          }
        } catch (e) {
          console.error("Cron error:", e);
        }
      })()
    );
  },
} satisfies ExportedHandler<Env>;
