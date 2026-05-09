/**
 * xcpdex API Worker — Hono on Cloudflare Workers.
 * Routes: market data, portfolio, swaps, indexer cron.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';

import { LOCK_TIMEOUT_SECONDS } from "./lib/constants";
import { fixScientificNotation } from "./lib/json";
import { handleOhlc } from "./routes/ohlc";
import { handleTrades } from "./routes/trades";
import { handlePair, handlePairs } from "./routes/pairs";
import { handleTrending } from "./routes/trending";
import { handleBook } from "./routes/book";
import { handleMarkets } from "./routes/markets";
import { handleAsset } from "./routes/asset";
import { handleAssetActivity } from "./routes/asset-activity";
import { handleAssetRankings } from "./routes/asset-rankings";
import { handlePortfolioBids, handlePortfolioDispensers, handlePortfolioOrders } from "./routes/portfolio";
import { handleDispenserStats, handleDispenserStatsList } from "./routes/dispenser-stats";
import { handleTradeSummary } from "./routes/trade-summary";
import { handleAnalytics } from "./routes/analytics";
import { handleOrdersLatest } from "./routes/orders-latest";
import { handleSearch } from "./routes/search";
import { handleBlock } from "./routes/block";
import { handleTags, handleAssetTags } from "./routes/tags";
import { handleDeals } from "./routes/deals";
import { handleAddressPools, handlePool, handlePoolAddress, handlePools } from "./routes/pools";
import { refreshDealScores } from "./indexer/deal-scores";
import { indexAllAssets, syncNewAssets } from "./indexer/assets";
import { handleDispensersLatest, handleDispensesLatest } from "./routes/dispensers-latest";
import { syncTags, syncTokenscanCollections, syncPepeWtfCollections, syncStampchainCollection, syncScannableNfts, syncKaleidoscope } from "./indexer/tags";
import { handleGetSwaps, handleGetSwap, handleCancelSwap, handlePrepareListingPsbt, handleCompleteListingPsbt, handlePrepareFill, handleCompleteFill, handlePrepareCancelSwap } from "./routes/swaps";
import { checkPendingFills } from "./lib/swap-monitor";
import { syncBlocks } from "./indexer/sync-block";
import { syncPools } from "./indexer/pool-snapshot";
import { runCatchupAggregation, runCatchupStats, runCatchupDispenserStats, aggregateCandlesForPair } from "./indexer/aggregate";
import { backfillTrades, backfillDispenses, backfillDispensers, backfillPoolTradesFromIndexedMatches } from "./indexer/backfill";
import { syncOrders, syncDispensers, runSnapshotStep, reindexOrders } from "./indexer/snapshot";
import { getMode, setMode, deleteState } from "./indexer/state";
import { updatePairStats, refreshStalePairStats, backfillMissingLongnames } from "./indexer/stats";
import { refreshStaleDispenserStats } from "./indexer/dispenser-stats";

export interface Env {
  DB: D1Database;
  CP_API_BASE: string;
  INDEXER_TOKEN?: string;
  FEE_ADDRESS?: string;
}

type Bindings = Env;

const app = new Hono<{ Bindings: Bindings }>();

// ── Middleware ───────────────────────────────────────────────────────────

app.use('*', cors());

// Fix scientific notation in JSON responses (e.g. 7.1e-7 → 0.00000071)
app.use('*', async (c, next) => {
  await next();
  const ct = c.res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const text = await c.res.text();
    c.res = new Response(fixScientificNotation(text), {
      status: c.res.status,
      headers: c.res.headers,
    });
  }
});

// Auth for indexer endpoints
app.use('/indexer/*', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  if (!c.env.INDEXER_TOKEN) {
    return Response.json({ error: 'INDEXER_TOKEN not configured' }, { status: 500 });
  }
  const auth = bearerAuth({ token: c.env.INDEXER_TOKEN });
  return auth(c, next);
});

// ── Public Routes ───────────────────────────────────────────────────────

app.get('/ohlc/:pair', (c) => handleOhlc(c.req.raw, c.env.DB, c.req.param('pair')));
app.get('/trades/:pair', (c) => handleTrades(c.req.raw, c.env.DB, c.req.param('pair')));
app.get('/book/:pair', (c) => handleBook(c.req.raw, c.env.DB, c.req.param('pair')));
app.get('/pair/:pair', (c) => handlePair(new URL(c.req.url), c.env.DB, c.req.param('pair')));
app.get('/pairs', (c) => handlePairs(c.req.raw, c.env.DB));
app.get('/trade-summary', (c) => handleTradeSummary(c.req.raw, c.env.DB));
app.get('/markets', (c) => handleMarkets(c.req.raw, c.env.DB));
app.get('/trending', (c) => handleTrending(c.req.raw, c.env.DB));
app.get('/asset/:name', (c) => handleAsset(new URL(c.req.url), c.env.DB, c.req.param('name')));
app.get('/asset/:name/activity', (c) => handleAssetActivity(c.req.raw, c.env.DB, c.req.param('name')));
app.get('/asset/:name/rankings', (c) => handleAssetRankings(c.req.raw, c.env.DB, c.req.param('name')));
app.get('/portfolio/:address/bids', (c) => handlePortfolioBids(c.req.raw, c.env.DB, c.env.CP_API_BASE, c.req.param('address')));
app.get('/portfolio/:address/orders', (c) => handlePortfolioOrders(c.req.raw, c.env.DB, c.req.param('address')));
app.get('/portfolio/:address/dispensers', (c) => handlePortfolioDispensers(c.req.raw, c.env.DB, c.req.param('address')));
app.get('/dispenser-stats', (c) => handleDispenserStatsList(c.req.raw, c.env.DB));
app.get('/dispenser-stats/:asset', (c) => handleDispenserStats(new URL(c.req.url), c.env.DB, c.req.param('asset')));
app.get('/orders/latest', (c) => handleOrdersLatest(c.req.raw, c.env.DB));
app.get('/dispensers/latest', (c) => handleDispensersLatest(c.req.raw, c.env.DB));
app.get('/dispenses/latest', (c) => handleDispensesLatest(c.req.raw, c.env.DB));
app.get('/search', (c) => handleSearch(c.req.raw, c.env.DB));
app.get('/analytics', (c) => handleAnalytics(c.req.raw, c.env.DB));
app.get('/block', (c) => handleBlock(c.env.DB));
app.get('/tags', (c) => handleTags(c.req.raw, c.env.DB));
app.get('/tags/asset/:asset', (c) => handleAssetTags(c.req.raw, c.env.DB, c.req.param('asset')));
app.get('/deals', (c) => handleDeals(c.req.raw, c.env.DB));
app.get('/pools', (c) => handlePools(c.req.raw, c.env.DB));
app.get('/pools/:lpAsset', (c) => handlePool(new URL(c.req.url), c.env.DB, c.req.param('lpAsset')));
app.get('/pools/:lpAsset/addresses/:address', (c) => handlePoolAddress(new URL(c.req.url), c.env.DB, c.req.param('lpAsset'), c.req.param('address')));
app.get('/addresses/:address/pools', (c) => handleAddressPools(new URL(c.req.url), c.env.DB, c.req.param('address')));

// ── Swap Routes ─────────────────────────────────────────────────────────

app.get('/swaps', (c) => handleGetSwaps(c.req.raw, c.env.DB));
app.get('/swaps/:id', (c) => handleGetSwap(c.env.DB, c.req.param('id')));
app.post('/swaps/prepare-listing', (c) => handlePrepareListingPsbt(c.req.raw, c.env));
app.post('/swaps/complete-listing', (c) => handleCompleteListingPsbt(c.req.raw, c.env));
app.post('/swaps/:id/prepare-fill', (c) => handlePrepareFill(c.req.raw, c.env, c.req.param('id')));
app.post('/swaps/:id/complete-fill', (c) => handleCompleteFill(c.req.raw, c.env.DB, c.req.param('id')));
app.post('/swaps/:id/prepare-cancel', (c) => handlePrepareCancelSwap(c.env.DB, c.req.param('id')));
app.post('/swaps/:id/cancel', (c) => handleCancelSwap(c.req.raw, c.env.DB, c.req.param('id')));

// ── Status ──────────────────────────────────────────────────────────────

app.get('/status', async (c) => {
  const db = c.env.DB;
  const mode = await getMode(db);

  const [tradeCount, pairCount, openOrderCount, dispenseCount, openDispenserCount, poolCount, candleCount, state] =
    await db.batch([
      db.prepare(`SELECT COUNT(*) as cnt FROM trades`),
      db.prepare(`SELECT COUNT(*) as cnt FROM pair_stats`),
      db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'open'`),
      db.prepare(`SELECT COUNT(*) as cnt FROM dispenses`),
      db.prepare(`SELECT COUNT(*) as cnt FROM dispensers WHERE status < 10`),
      db.prepare(`SELECT COUNT(*) as cnt FROM pools`),
      db.prepare(`SELECT COUNT(*) as cnt FROM candles`),
      db.prepare(`SELECT key, value FROM indexer_state`),
    ]);

  const cnt = (r: D1Result) => (r.results[0] as { cnt: number } | undefined)?.cnt ?? 0;
  const stateRows = state.results as { key: string; value: string }[];

  return Response.json({
    ok: true,
    mode,
    trades: cnt(tradeCount),
    pairs: cnt(pairCount),
    open_orders: cnt(openOrderCount),
    dispenses: cnt(dispenseCount),
    open_dispensers: cnt(openDispenserCount),
    pools: cnt(poolCount),
    candles: cnt(candleCount),
    indexer: Object.fromEntries(
      stateRows
        .filter((r) => !['aggregation_offset'].includes(r.key))
        .map((r) => [r.key, r.value])
    ),
  });
});

// ── Indexer Routes (auth handled by middleware) ─────────────────────────

app.post('/indexer/refresh-deals', async (c) => {
  const result = await refreshDealScores(c.env.DB);
  return Response.json({ ok: true, ...result });
});

app.post('/indexer/sync-assets', async (c) => {
  const url = new URL(c.req.url);
  const mode = url.searchParams.get("mode") ?? "incremental";
  const maxPages = parseInt(url.searchParams.get("pages") ?? (mode === "full" ? "20" : "10"), 10);
  const reset = url.searchParams.get("reset") === "1";
  const result = mode === "full"
    ? await indexAllAssets(c.env.DB, maxPages, reset)
    : await syncNewAssets(c.env.DB, maxPages);
  return Response.json({ ok: true, mode, ...result });
});

app.post('/indexer/start', async (c) => {
  const mode = await getMode(c.env.DB);
  if (mode !== "IDLE") {
    return Response.json({ error: `Cannot start: mode is ${mode}, expected IDLE` }, { status: 409 });
  }
  await Promise.all([
    deleteState(c.env.DB, "trade_backfill_cursor"),
    deleteState(c.env.DB, "trade_backfill_total"),
    deleteState(c.env.DB, "dispense_backfill_cursor"),
    deleteState(c.env.DB, "dispense_backfill_total"),
    deleteState(c.env.DB, "dispenser_backfill_cursor"),
    deleteState(c.env.DB, "dispenser_backfill_total"),
    deleteState(c.env.DB, "aggregation_cursor"),
    deleteState(c.env.DB, "sync_lock"),
  ]);
  await setMode(c.env.DB, "BACKFILL_TRADES");
  return Response.json({ ok: true, mode: "BACKFILL_TRADES" });
});

app.post('/indexer/backfill', async (c) => {
  const url = new URL(c.req.url);
  const pages = Math.min(parseInt(url.searchParams.get("pages") ?? "20", 10), 50);
  const mode = await getMode(c.env.DB);

  switch (mode) {
    case "BACKFILL_TRADES": return Response.json(await backfillTrades(c.env.DB, c.env.CP_API_BASE, pages));
    case "BACKFILL_DISPENSES": return Response.json(await backfillDispenses(c.env.DB, c.env.CP_API_BASE, pages));
    case "BACKFILL_DISPENSERS": return Response.json(await backfillDispensers(c.env.DB, c.env.CP_API_BASE, pages));
    case "SNAPSHOT_SYNC": return Response.json({ type: "snapshot", ...await runSnapshotStep(c.env.DB, c.env.CP_API_BASE) });
    case "BUILD_AGGREGATES": return Response.json({ type: "aggregates", ...await runCatchupAggregation(c.env.DB) });
    case "FOLLOWING": return Response.json({ done: true, mode: "FOLLOWING" });
    default: return Response.json({ error: `Cannot backfill in mode: ${mode}` }, { status: 409 });
  }
});

app.post('/indexer/aggregate', async (c) => {
  const url = new URL(c.req.url);
  if (!url.searchParams.has("offset")) {
    await c.env.DB.prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('aggregation_cursor', '') ON CONFLICT (key) DO NOTHING`
    ).run();
    return Response.json(await runCatchupAggregation(c.env.DB));
  }

  const offset = parseInt(url.searchParams.get("offset")!, 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 200);
  const pairs = await c.env.DB.prepare(
    `SELECT pair, base_asset, quote_asset, first_trade_time FROM pair_stats ORDER BY pair LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<{ pair: string; base_asset: string; quote_asset: string; first_trade_time: number | null }>();

  for (const p of pairs.results) {
    await aggregateCandlesForPair(c.env.DB, p.pair, p.first_trade_time ?? 0);
    await updatePairStats(c.env.DB, p.pair, p.base_asset, p.quote_asset);
  }

  return Response.json({ aggregated: pairs.results.length, offset, pairs: pairs.results.map((p) => p.pair) });
});

app.post('/indexer/sync', async (c) => {
  const maxBlocks = Math.min(parseInt(new URL(c.req.url).searchParams.get("blocks") ?? "10", 10), 50);
  return Response.json(await syncBlocks(c.env.DB, c.env.CP_API_BASE, maxBlocks));
});

app.post('/indexer/sync-pools', async (c) => {
  const url = new URL(c.req.url);
  const maxPages = Math.min(parseInt(url.searchParams.get("pages") ?? "10", 10), 50);
  const cursor = url.searchParams.get("cursor");
  return Response.json(await syncPools(c.env.DB, c.env.CP_API_BASE, maxPages, cursor));
});

app.post('/indexer/backfill-pool-trades', async (c) => {
  const limit = Math.min(parseInt(new URL(c.req.url).searchParams.get("limit") ?? "500", 10), 2000);
  const result = await backfillPoolTradesFromIndexedMatches(c.env.DB, limit);

  if (result.affected_pairs.length > 0) {
    const placeholders = result.affected_pairs.map(() => "?").join(",");
    const pairs = await c.env.DB
      .prepare(
        `SELECT pair, base_asset, quote_asset, MIN(block_time) AS first_time
         FROM trades
         WHERE pair IN (${placeholders})
         GROUP BY pair, base_asset, quote_asset`
      )
      .bind(...result.affected_pairs)
      .all<{ pair: string; base_asset: string; quote_asset: string; first_time: number }>();

    for (const p of pairs.results) {
      await aggregateCandlesForPair(c.env.DB, p.pair, p.first_time ?? 0);
      await updatePairStats(c.env.DB, p.pair, p.base_asset, p.quote_asset);
    }
  }

  return Response.json(result);
});

app.post('/indexer/full-sync', async (c) => {
  const [orderResult, dispenserResult, poolResult] = await Promise.allSettled([
    syncOrders(c.env.DB, c.env.CP_API_BASE),
    syncDispensers(c.env.DB, c.env.CP_API_BASE),
    syncPools(c.env.DB, c.env.CP_API_BASE),
  ]);
  return Response.json({
    orders: orderResult.status === "fulfilled" ? orderResult.value : { error: String(orderResult.reason) },
    dispensers: dispenserResult.status === "fulfilled" ? dispenserResult.value : { error: String(dispenserResult.reason) },
    pools: poolResult.status === "fulfilled" ? poolResult.value : { error: String(poolResult.reason) },
  });
});

app.post('/indexer/reindex-orders', async (c) => {
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status") ?? "open";
  const cursor = url.searchParams.get("cursor") || null;
  const batch = Math.min(parseInt(url.searchParams.get("batch") ?? "200", 10), 1000);
  return Response.json(await reindexOrders(c.env.DB, c.env.CP_API_BASE, status, cursor, batch));
});

app.post('/indexer/reset', async (c) => {
  await Promise.all([
    setMode(c.env.DB, "IDLE"),
    deleteState(c.env.DB, "trade_backfill_cursor"),
    deleteState(c.env.DB, "trade_backfill_total"),
    deleteState(c.env.DB, "dispense_backfill_cursor"),
    deleteState(c.env.DB, "dispense_backfill_total"),
    deleteState(c.env.DB, "dispenser_backfill_cursor"),
    deleteState(c.env.DB, "dispenser_backfill_total"),
    deleteState(c.env.DB, "aggregation_cursor"),
  ]);
  return Response.json({ ok: true, mode: "IDLE" });
});

app.post('/indexer/backfill-missing', async (c) => {
  await Promise.all([
    deleteState(c.env.DB, "dispense_backfill_cursor"),
    deleteState(c.env.DB, "dispense_backfill_total"),
    deleteState(c.env.DB, "dispenser_backfill_cursor"),
    deleteState(c.env.DB, "dispenser_backfill_total"),
  ]);
  await setMode(c.env.DB, "BACKFILL_DISPENSES");
  return Response.json({ ok: true, mode: "BACKFILL_DISPENSES" });
});

app.post('/indexer/sync-tags', async (c) => {
  const tagType = new URL(c.req.url).searchParams.get("type") ?? "collection";
  const syncFns: Record<string, () => Promise<any>> = {
    tokenscan: () => syncTokenscanCollections(c.env.DB),
    pepewtf: () => syncPepeWtfCollections(c.env.DB),
    stampchain: () => syncStampchainCollection(c.env.DB),
    scannable: () => syncScannableNfts(c.env.DB),
    kaleidoscope: () => syncKaleidoscope(c.env.DB),
  };
  const fn = syncFns[tagType] ?? (() => syncTags(c.env.DB, tagType));
  return Response.json({ ok: true, ...await fn() });
});

// ── Cron ─────────────────────────────────────────────────────────────────

// The scheduled handler is separate from Hono (Workers API requirement)
async function scheduled(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const lock = await env.DB.prepare(
    `INSERT INTO indexer_state (key, value) VALUES ('cron_lock', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value
     WHERE CAST(value AS INTEGER) < ?`
  ).bind(String(now), now - LOCK_TIMEOUT_SECONDS).run();
  if (lock.meta.changes === 0) return;

  try {
    const mode = await getMode(env.DB);

    switch (mode) {
      case "IDLE": break;
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
      case "BACKFILL_DISPENSERS": {
        const r = await backfillDispensers(env.DB, env.CP_API_BASE, 20);
        console.log(`Cron: backfill dispensers — ${r.inserted} inserted, ${r.progress}% done`);
        break;
      }
      case "SNAPSHOT_SYNC": {
        const r = await runSnapshotStep(env.DB, env.CP_API_BASE);
        console.log(`Cron: snapshot sync — phase=${r.phase}, done=${r.done}`);
        break;
      }
      case "BUILD_AGGREGATES": {
        const r = await runCatchupAggregation(env.DB);
        console.log(`Cron: aggregation — done=${r.done}`);
        break;
      }
      case "REFRESH_STATS": {
        const statResult = await runCatchupStats(env.DB);
        const dispResult = await runCatchupDispenserStats(env.DB);
        console.log(`Cron: stats refresh — pairs=${statResult.processed}, dispensers=${dispResult.processed}`);
        if (statResult.done && dispResult.done) {
          await setMode(env.DB, "FOLLOWING");
        }
        break;
      }
      case "FOLLOWING": {
        await syncBlocks(env.DB, env.CP_API_BASE, 10);
        await refreshStalePairStats(env.DB);
        await refreshStaleDispenserStats(env.DB);
        await refreshDealScores(env.DB);
        await checkPendingFills(env.DB);
        await syncNewAssets(env.DB, 2);
        await backfillMissingLongnames(env.DB, 10);
        break;
      }
    }
  } finally {
    await env.DB.prepare(
      `UPDATE indexer_state SET value = '0' WHERE key = 'cron_lock'`
    ).run();
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(scheduled(env));
  },
} satisfies ExportedHandler<Bindings>;
