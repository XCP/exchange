import { LOCK_TIMEOUT_SECONDS } from "./lib/constants";
import { fixScientificNotation } from "./lib/json";
import { handleOhlc } from "./routes/ohlc";
import { handleTrades } from "./routes/trades";
import { handlePair, handlePairs } from "./routes/pairs";
import { handleTrending } from "./routes/trending";
import { handleBook } from "./routes/book";
import { handleMarkets } from "./routes/markets";
import { handleAsset } from "./routes/asset";
import { handlePortfolioBids, handlePortfolioDispensers, handlePortfolioOrders } from "./routes/portfolio";
import { handleDispenserStats, handleDispenserStatsList } from "./routes/dispenser-stats";
import { handleTradeSummary } from "./routes/trade-summary";
import { handleAnalytics } from "./routes/analytics";
import { handleSearch } from "./routes/search";
import { handleGetSwaps, handleGetSwap, handleCancelSwap, handlePrepareListingPsbt, handleCompleteListingPsbt, handlePrepareFill, handleCompleteFill, handlePrepareCancelSwap } from "./routes/swaps";
import { checkPendingFills } from "./lib/swap-monitor";
import { syncBlocks } from "./indexer/sync-block";
import { runCatchupAggregation, runCatchupStats, runCatchupDispenserStats, aggregateCandlesForPair } from "./indexer/aggregate";
import { backfillTrades, backfillDispenses } from "./indexer/backfill";
import { syncOrders, syncDispensers, runSnapshotStep } from "./indexer/snapshot";
import { getMode, setMode, deleteState } from "./indexer/state";
import { updatePairStats, refreshStalePairStats } from "./indexer/stats";
import { refreshStaleDispenserStats } from "./indexer/dispenser-stats";

export interface Env {
  DB: D1Database;
  CP_API_BASE: string;
  INDEXER_TOKEN?: string;
  FEE_ADDRESS?: string;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function withCors(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }

  // Fix scientific notation in JSON responses (e.g. 7.1e-7 → 0.00000071)
  const ct = response.headers.get("Content-Type") || ""
  if (ct.includes("application/json")) {
    const text = await response.text()
    return new Response(fixScientificNotation(text), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
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
        return await withCors(Response.json({ error: "INDEXER_TOKEN not configured" }, { status: 500 }));
      }
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.INDEXER_TOKEN}`) {
        return await withCors(Response.json({ error: "Unauthorized" }, { status: 401 }));
      }
    }

    try {
      // Route: GET /ohlc/:pair
      const ohlcMatch = path.match(/^\/ohlc\/([A-Za-z0-9._]+)$/);
      if (ohlcMatch) {
        return await withCors(await handleOhlc(request, env.DB, ohlcMatch[1]));
      }

      // Route: GET /trades/:pair
      const tradesMatch = path.match(/^\/trades\/([A-Za-z0-9._]+)$/);
      if (tradesMatch) {
        return await withCors(await handleTrades(request, env.DB, tradesMatch[1]));
      }

      // Route: GET /book/:pair
      const bookMatch = path.match(/^\/book\/([A-Za-z0-9._]+)$/);
      if (bookMatch) {
        return await withCors(await handleBook(request, env.DB, bookMatch[1]));
      }

      // Route: GET /pair/:pair
      const pairMatch = path.match(/^\/pair\/([A-Za-z0-9._]+)$/);
      if (pairMatch) {
        return await withCors(await handlePair(env.DB, pairMatch[1]));
      }

      // Route: GET /pairs
      if (path === "/pairs") {
        return await withCors(await handlePairs(request, env.DB));
      }

      // Route: GET /trade-summary
      if (path === "/trade-summary") {
        return await withCors(await handleTradeSummary(request, env.DB));
      }

      // Route: GET /markets
      if (path === "/markets") {
        return await withCors(await handleMarkets(request, env.DB));
      }

      // Route: GET /trending
      if (path === "/trending") {
        return await withCors(await handleTrending(request, env.DB));
      }

      // Route: GET /asset/:name
      const assetMatch = path.match(/^\/asset\/([A-Za-z0-9._]+)$/);
      if (assetMatch) {
        return await withCors(await handleAsset(env.DB, assetMatch[1]));
      }

      // Route: GET /portfolio/:address/bids
      const portfolioBidsMatch = path.match(
        /^\/portfolio\/([A-Za-z0-9]+)\/bids$/
      );
      if (portfolioBidsMatch) {
        return await withCors(
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
        return await withCors(
          await handlePortfolioOrders(request, env.DB, portfolioOrdersMatch[1])
        );
      }

      // Route: GET /portfolio/:address/dispensers
      const portfolioDispensersMatch = path.match(
        /^\/portfolio\/([A-Za-z0-9]+)\/dispensers$/
      );
      if (portfolioDispensersMatch) {
        return await withCors(
          await handlePortfolioDispensers(
            request,
            env.DB,
            portfolioDispensersMatch[1]
          )
        );
      }

      // Route: GET /dispenser-stats (list)
      if (path === "/dispenser-stats") {
        return await withCors(await handleDispenserStatsList(request, env.DB));
      }

      // Route: GET /dispenser-stats/:asset
      const dispenserStatsMatch = path.match(/^\/dispenser-stats\/([A-Za-z0-9._]+)$/);
      if (dispenserStatsMatch) {
        return await withCors(await handleDispenserStats(env.DB, dispenserStatsMatch[1]));
      }

      // Route: GET /search?q=...
      if (path === "/search") {
        return await withCors(await handleSearch(request, env.DB));
      }

      // Route: GET /analytics
      if (path === "/analytics") {
        return await withCors(await handleAnalytics(request, env.DB));
      }

      // Route: GET /status — mode, progress, table counts
      if (path === "/status") {
        const mode = await getMode(env.DB);

        const [tradeCount, pairCount, openOrderCount, dispenseCount, openDispenserCount, candleCount, state] =
          await env.DB.batch([
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades`),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM pair_stats`),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'open'`),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM dispenses`),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM dispensers WHERE status < 10`),
            env.DB.prepare(`SELECT COUNT(*) as cnt FROM candles`),
            env.DB.prepare(`SELECT key, value FROM indexer_state`),
          ]);

        const cnt = (r: D1Result) => (r.results[0] as { cnt: number } | undefined)?.cnt ?? 0;
        const stateRows = state.results as { key: string; value: string }[];
        const staleKeys = ['aggregation_offset'];

        return await withCors(
          Response.json({
            ok: true,
            mode,
            trades: cnt(tradeCount),
            pairs: cnt(pairCount),
            open_orders: cnt(openOrderCount),
            dispenses: cnt(dispenseCount),
            open_dispensers: cnt(openDispenserCount),
            candles: cnt(candleCount),
            indexer: Object.fromEntries(
              stateRows
                .filter((r) => !staleKeys.includes(r.key))
                .map((r) => [r.key, r.value])
            ),
          })
        );
      }

      // POST /indexer/start — IDLE → BACKFILL_TRADES
      if (path === "/indexer/start" && request.method === "POST") {
        const mode = await getMode(env.DB);
        if (mode !== "IDLE") {
          return await withCors(
            Response.json({ error: `Cannot start: mode is ${mode}, expected IDLE` }, { status: 409 })
          );
        }
        // Clear any stale state from a previous aborted run before starting fresh
        await Promise.all([
          deleteState(env.DB, "trade_backfill_cursor"),
          deleteState(env.DB, "trade_backfill_total"),
          deleteState(env.DB, "dispense_backfill_cursor"),
          deleteState(env.DB, "dispense_backfill_total"),
          deleteState(env.DB, "aggregation_cursor"),
          deleteState(env.DB, "sync_lock"),
        ]);
        await setMode(env.DB, "BACKFILL_TRADES");
        return await withCors(Response.json({ ok: true, mode: "BACKFILL_TRADES" }));
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
            return await withCors(Response.json(result));
          }
          case "BACKFILL_DISPENSES": {
            const result = await backfillDispenses(env.DB, env.CP_API_BASE, pages);
            return await withCors(Response.json(result));
          }
          case "SNAPSHOT_SYNC": {
            const result = await runSnapshotStep(env.DB, env.CP_API_BASE);
            return await withCors(Response.json({ type: "snapshot", ...result }));
          }
          case "BUILD_AGGREGATES": {
            const result = await runCatchupAggregation(env.DB);
            return await withCors(Response.json({ type: "aggregates", ...result }));
          }
          case "FOLLOWING":
            return await withCors(Response.json({ done: true, mode: "FOLLOWING" }));
          default:
            return await withCors(
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
              `INSERT INTO indexer_state (key, value) VALUES ('aggregation_cursor', '')
               ON CONFLICT (key) DO NOTHING`
            )
            .run();
          const result = await runCatchupAggregation(env.DB);
          return await withCors(Response.json(result));
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

        return await withCors(
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
        return await withCors(Response.json(result));
      }

      // POST /indexer/full-sync — re-snapshot orders+dispensers (recovery, any mode)
      if (path === "/indexer/full-sync" && request.method === "POST") {
        const [orderResult, dispenserResult] = await Promise.allSettled([
          syncOrders(env.DB, env.CP_API_BASE),
          syncDispensers(env.DB, env.CP_API_BASE),
        ]);
        return await withCors(Response.json({
          orders: orderResult.status === "fulfilled" ? orderResult.value : { error: String(orderResult.reason) },
          dispensers: dispenserResult.status === "fulfilled" ? dispenserResult.value : { error: String(dispenserResult.reason) },
        }));
      }

      // POST /indexer/reset — reset to IDLE (for re-index)
      if (path === "/indexer/reset" && request.method === "POST") {
        await Promise.all([
          setMode(env.DB, "IDLE"),
          deleteState(env.DB, "trade_backfill_cursor"),
          deleteState(env.DB, "trade_backfill_total"),
          deleteState(env.DB, "dispense_backfill_cursor"),
          deleteState(env.DB, "dispense_backfill_total"),
          deleteState(env.DB, "aggregation_cursor"),
        ]);
        return await withCors(Response.json({ ok: true, mode: "IDLE" }));
      }

      // ---- Swap routes (PSBT atomic swaps) ----

      // Route: POST /swaps/prepare-listing — server constructs seller PSBT
      if (path === "/swaps/prepare-listing" && request.method === "POST") {
        return await withCors(await handlePrepareListingPsbt(request, env));
      }

      // Route: POST /swaps/complete-listing — seller submits signed PSBT
      if (path === "/swaps/complete-listing" && request.method === "POST") {
        return await withCors(await handleCompleteListingPsbt(request, env));
      }

      // Route: GET /swaps — browse listings
      if (path === "/swaps" && request.method === "GET") {
        return await withCors(await handleGetSwaps(request, env.DB));
      }

      // Route: POST /swaps/:id/prepare-fill — server constructs buyer PSBT
      const swapPrepareFillMatch = path.match(/^\/swaps\/([0-9a-f-]+)\/prepare-fill$/);
      if (swapPrepareFillMatch && request.method === "POST") {
        return await withCors(await handlePrepareFill(request, env, swapPrepareFillMatch[1]));
      }

      // Route: POST /swaps/:id/complete-fill — buyer submits signed PSBT
      const swapCompleteFillMatch = path.match(/^\/swaps\/([0-9a-f-]+)\/complete-fill$/);
      if (swapCompleteFillMatch && request.method === "POST") {
        return await withCors(await handleCompleteFill(request, env.DB, swapCompleteFillMatch[1]));
      }

      // Route: POST /swaps/:id/prepare-cancel
      const swapPrepareCancelMatch = path.match(/^\/swaps\/([0-9a-f-]+)\/prepare-cancel$/);
      if (swapPrepareCancelMatch && request.method === "POST") {
        return await withCors(await handlePrepareCancelSwap(env.DB, swapPrepareCancelMatch[1]));
      }

      // Route: POST /swaps/:id/cancel
      const swapCancelMatch = path.match(/^\/swaps\/([0-9a-f-]+)\/cancel$/);
      if (swapCancelMatch && request.method === "POST") {
        return await withCors(await handleCancelSwap(request, env.DB, swapCancelMatch[1]));
      }

      // Route: GET /swaps/:id — single listing
      const swapMatch = path.match(/^\/swaps\/([0-9a-f-]+)$/);
      if (swapMatch) {
        return await withCors(await handleGetSwap(env.DB, swapMatch[1]));
      }

      return await withCors(
        Response.json({ error: "Not found" }, { status: 404 })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Request error:", message, e instanceof Error ? e.stack : "");
      return await withCors(
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
        // Cron concurrency guard: prevent overlapping cron executions
        const now = Math.floor(Date.now() / 1000);
        const lock = await env.DB
          .prepare(
            `INSERT INTO indexer_state (key, value) VALUES ('cron_lock', ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value
             WHERE CAST(value AS INTEGER) < ?`
          )
          .bind(String(now), now - LOCK_TIMEOUT_SECONDS)
          .run();
        if (lock.meta.changes === 0) return; // Another cron is running

        try {
          const mode = await getMode(env.DB);

          switch (mode) {
            case "IDLE":
              break;

            case "BACKFILL_TRADES": {
              const r = await backfillTrades(env.DB, env.CP_API_BASE, 20);
              console.log(`Cron: backfill trades — ${r.inserted} inserted, ${r.progress}% done`);
              break;
            }

            case "BACKFILL_DISPENSES": {
              const r = await backfillDispenses(env.DB, env.CP_API_BASE, 20);
              console.log(`Cron: backfill dispenses — ${r.inserted} inserted, ${r.progress}% done`);
              break;
            }

            case "SNAPSHOT_SYNC": {
              const r = await runSnapshotStep(env.DB, env.CP_API_BASE, 10);
              console.log(`Cron: snapshot step=${r.step}`);
              break;
            }

            case "BUILD_AGGREGATES": {
              const aggStart = Date.now();
              let aggTotal = 0;
              let aggDone = false;
              // Without per-pair stats, each batch uses ~30 D1 queries instead
              // of ~270. With 200 pairs/batch and 1000 queries/invocation budget,
              // we can safely run 8 batches (1600 pairs) per cron tick.
              const MAX_AGG_BATCHES = 8;
              for (let b = 0; b < MAX_AGG_BATCHES; b++) {
                const r = await runCatchupAggregation(env.DB);
                aggTotal += r.processed;
                if (r.done) { aggDone = true; break; }
              }
              console.log(`Cron: aggregation — processed=${aggTotal}, done=${aggDone}, elapsed=${Date.now() - aggStart}ms`);
              break;
            }

            case "REFRESH_STATS": {
              const statsStart = Date.now();
              let statsTotal = 0;
              let allStatsDone = false;

              // Bulk SQL: each call processes up to 7000 items using ~450-525
              // D1 queries (6-7 per 95-item chunk). Both can fit if pair stats
              // finishes early in this tick.
              const pr = await runCatchupStats(env.DB);
              statsTotal += pr.processed;

              if (pr.done) {
                const dr = await runCatchupDispenserStats(env.DB);
                statsTotal += dr.processed;
                allStatsDone = dr.done;
              }

              console.log(`Cron: stats refresh — processed=${statsTotal}, done=${allStatsDone}, elapsed=${Date.now() - statsStart}ms`);
              break;
            }

            case "FOLLOWING": {
              const sync = await syncBlocks(env.DB, env.CP_API_BASE, 50);
              if (sync.blocks_processed > 0) {
                console.log(
                  `Sync: ${sync.blocks_processed} blocks (${sync.last_block}/${sync.current_block}) ` +
                  `trades=${sync.trades_inserted} orders=+${sync.orders_upserted}/-${sync.orders_closed} ` +
                  `dispensers=+${sync.dispensers_upserted}/~${sync.dispensers_updated} ` +
                  `dispenses=${sync.dispenses_inserted}`
                );
              }

              // Monitor pending swap fills for confirmation + detect anomalous UTXO spends
              try {
                const swapStatus = await checkPendingFills(env.DB);
                if (swapStatus.confirmed > 0 || swapStatus.relisted > 0 || swapStatus.anomalous > 0) {
                  console.log(
                    `Swap monitor: confirmed=${swapStatus.confirmed} relisted=${swapStatus.relisted} anomalous=${swapStatus.anomalous}`
                  );
                }
              } catch (e) {
                console.error("Swap monitor error:", e);
              }

              const now = Math.floor(Date.now() / 1000);

              // Periodic order reconciliation: re-sync open orders with CP API every 24 hours.
              // Catches stale orders (filled/cancelled) that were missed by block events.
              const ORDER_RECONCILE_INTERVAL = 24 * 3600;
              const lastReconcileRow = await env.DB
                .prepare(`SELECT value FROM indexer_state WHERE key = 'last_order_reconcile'`)
                .first<{ value: string }>();
              const lastReconcile = lastReconcileRow ? parseInt(lastReconcileRow.value, 10) : 0;

              if (now - lastReconcile >= ORDER_RECONCILE_INTERVAL) {
                try {
                  const reconciled = await syncOrders(env.DB, env.CP_API_BASE);
                  await env.DB
                    .prepare(
                      `INSERT INTO indexer_state (key, value) VALUES ('last_order_reconcile', ?)
                       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
                    )
                    .bind(String(now))
                    .run();
                  console.log(`Order reconciliation: synced=${reconciled.synced} closed=${reconciled.closed}`);
                } catch (e) {
                  console.error("Order reconciliation error:", e);
                }
              }

              // Periodic stats refresh: recalculate stale 24h/7d windows every 6 hours
              const STATS_REFRESH_INTERVAL = 6 * 3600;
              const lastRefreshRow = await env.DB
                .prepare(`SELECT value FROM indexer_state WHERE key = 'last_stats_refresh'`)
                .first<{ value: string }>();
              const lastRefresh = lastRefreshRow ? parseInt(lastRefreshRow.value, 10) : 0;

              if (now - lastRefresh >= STATS_REFRESH_INTERVAL) {
                const stalePairs = await refreshStalePairStats(env.DB);
                const staleDispensers = await refreshStaleDispenserStats(env.DB);
                await env.DB
                  .prepare(
                    `INSERT INTO indexer_state (key, value) VALUES ('last_stats_refresh', ?)
                     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
                  )
                  .bind(String(now))
                  .run();
                if (stalePairs > 0 || staleDispensers > 0) {
                  console.log(`Stats refresh: ${stalePairs} pairs, ${staleDispensers} dispenser assets`);
                }
              }
              break;
            }
          }
        } catch (e) {
          console.error("Cron error:", e);
        } finally {
          await env.DB.prepare(`DELETE FROM indexer_state WHERE key = 'cron_lock'`).run();
        }
      })()
    );
  },
} satisfies ExportedHandler<Env>;
