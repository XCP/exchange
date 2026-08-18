/**
 * xcpdex API Worker - Hono on Cloudflare Workers.
 * Routes: market data, portfolio, swaps, indexer cron.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';

import { LOCK_TIMEOUT_SECONDS } from "./lib/constants";
import { fixScientificNotation } from "./lib/json";
import { handleOhlc } from "./routes/ohlc";
import { handleDispenseOhlc } from "./routes/dispense-ohlc";
import { handlePoolLiquidity } from "./routes/pool-liquidity";
import { handleTrades } from "./routes/trades";
import { handlePair, handlePairs } from "./routes/pairs";
import { handleTrending } from "./routes/trending";
import { handleBook } from "./routes/book";
import { handleMarkets } from "./routes/markets";
import { handleAsset } from "./routes/asset";
import { handleAssets } from "./routes/assets";
import { handleAssetActivity } from "./routes/asset-activity";
import { handleAssetTrades } from "./routes/asset-trades";
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
import { handleMempool } from "./routes/mempool";
import { handleAddressPools, handleAssetPoolVenue, handlePool, handlePoolAddress, handlePools } from "./routes/pools";
import { handleCgPairs, handleCgTickers, handleCgOrderbook, handleCgHistoricalTrades } from "./routes/coingecko";
import { handleCmcSummary } from "./routes/coinmarketcap";
import { handleCatalogPairs } from "./routes/catalog";
import { handleDefiLlamaVolume } from "./routes/defillama";
import openapi from "./openapi.json";
import { refreshDealScores } from "./indexer/deal-scores";
import { indexAllAssets, syncNewAssets } from "./indexer/assets";
import { handleDispensersLatest, handleDispensesLatest } from "./routes/dispensers-latest";
import { syncTags, syncTokenscanCollections, syncPepeWtfCollections, syncStampchainCollection, syncScannableNfts, syncKaleidoscope } from "./indexer/tags";
import { syncLowQualityAssets } from "./indexer/low-quality";
import { handleGetSwaps, handleGetSwap, handleCancelSwap, handlePrepareListingPsbt, handleCompleteListingPsbt, handlePrepareFill, handleCompleteFill, handlePrepareCancelSwap } from "./routes/swaps";
import { checkPendingFills } from "./lib/swap-monitor";
import { syncBlocks } from "./indexer/sync-block";
import { syncPools } from "./indexer/pool-snapshot";
import { runCatchupAggregation, runCatchupStats, runCatchupDispenserStats, aggregateCandlesForPair } from "./indexer/aggregate";
import { backfillTrades, backfillDispenses, backfillDispensers, backfillPoolTradesFromIndexedMatches } from "./indexer/backfill";
import { syncOrders, syncDispensers, runSnapshotStep, reindexOrders } from "./indexer/snapshot";
import { getMode, setMode, deleteState } from "./indexer/state";
import { updatePairStats, refreshStalePairStats, refreshLongWindowPairStats, backfillMissingLongnames } from "./indexer/stats";
import { refreshStaleDispenserStats, refreshLongWindowDispenserStats } from "./indexer/dispenser-stats";

export interface Env {
  DB: D1Database;
  CP_API_BASE: string;
  INDEXER_TOKEN?: string;
  FEE_ADDRESS?: string;
  SITE_PRESENCE: DurableObjectNamespace;
}

type Bindings = Env;

const app = new Hono<{ Bindings: Bindings }>();

// Middleware

app.use('*', cors());

/**
 * Let the browser report timing for our own responses.
 *
 * Resource Timing zeroes `requestStart`/`responseStart` for cross-origin
 * responses unless the server opts in, and the site is served from xcpdex.com
 * while the API answers from api.xcpdex.com — so every measurement taken in a
 * real browser collapsed to a single opaque `duration`. A 1,150ms homepage
 * call could not be split into "queued behind the JS download" and "the worker
 * was slow", which are opposite problems with opposite fixes.
 *
 * Only timing is exposed, never headers or bodies, and every route here is
 * public and unauthenticated. Registered ahead of the cache middleware so it
 * also lands on responses served straight from the colo cache, which return
 * early and never reach the handler.
 */
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Timing-Allow-Origin', '*');
});

/**
 * Serve GETs from the colo's cache before the handler runs.
 *
 * Every read route already sets `cache-control`, and that header was doing
 * half the job it looked like it was doing: a Worker on a custom domain runs
 * BEFORE the zone cache, so `public, max-age=60` was a browser-only
 * instruction. Responses carried no cf-cache-status header at all, because
 * they never entered Cloudflare's cache — every distinct visitor's first
 * call, and every call after their own browser cache lapsed, ran the handler
 * and queried D1.
 *
 * That is invisible at low traffic and exactly the wrong shape for a launch:
 * the browse pages poll per open tab, so a thousand tabs is a thousand
 * independent invocations asking one database the same question. With this
 * they collapse to roughly one origin request per colo per TTL.
 *
 * Per-colo rather than global — N warm caches, warmed in proportion to how
 * many places the traffic comes from rather than how much of it there is.
 */
app.use('*', async (c, next) => {
  // Nothing that mutates, and nothing the Cache API will not key on. The
  // /swaps and /indexer routes are POSTs and skip this entirely.
  if (c.req.method !== 'GET') return next();

  // A websocket upgrade is a GET, but it is a handshake, not a document. There
  // is no body to store and the 101 must reach the client untouched, so it
  // never enters the cache path at all.
  if (c.req.header('Upgrade') === 'websocket') return next();

  const cache = caches.default;
  const hit = await cache.match(c.req.raw);
  if (hit) return hit;

  await next();

  // Errors are never cached. A 400 from a bad param and a 500 from a
  // transient D1 blip would both otherwise stick for the TTL, turning one bad
  // moment into a minute of them.
  const res = c.res;
  if (!res.ok) return;

  // Store only what asked to be stored — a route that omits cache-control is
  // asking to stay fresh, and this must not invent a TTL on its behalf.
  const control = res.headers.get('Cache-Control');
  if (!control || !/max-age=\d+/.test(control)) return;

  // clone() because a body reads once and the caller still needs it;
  // waitUntil so filling the cache never delays the response that filled it.
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
});

// Fix scientific notation in JSON responses (e.g. 7.1e-7 -> 0.00000071).
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

// Public Routes

app.get('/ohlc/:pair', (c) => handleOhlc(c.req.raw, c.env.DB, c.req.param('pair')));
app.get('/trades/:pair', (c) => handleTrades(c.req.raw, c.env.DB, c.req.param('pair')));
app.get('/book/:pair', (c) => handleBook(c.req.raw, c.env.DB, c.req.param('pair')));
app.get('/pair/:pair', (c) => handlePair(new URL(c.req.url), c.env.DB, c.req.param('pair')));
app.get('/pairs', (c) => handlePairs(c.req.raw, c.env.DB));
app.get('/trade-summary', (c) => handleTradeSummary(c.req.raw, c.env.DB));
app.get('/markets', (c) => handleMarkets(c.req.raw, c.env.DB));
app.get('/assets', (c) => handleAssets(c.req.raw, c.env.DB));
app.get('/trending', (c) => handleTrending(c.req.raw, c.env.DB));
app.get('/asset/:name', (c) => handleAsset(new URL(c.req.url), c.env.DB, c.req.param('name')));
// Every fill of this asset across pairs and venues — see asset-trades.ts.
app.get('/asset/:name/trades', (c) => handleAssetTrades(c.req.raw, c.env.DB, c.req.param('name')));
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
// Same response shape as /ohlc/:pair, but priced in BTC — see dispense-ohlc.ts.
app.get('/dispenses/ohlc/:asset', (c) => handleDispenseOhlc(c.req.raw, c.env.DB, c.req.param('asset')));
app.get('/search', (c) => handleSearch(c.req.raw, c.env.DB));
app.get('/analytics', (c) => handleAnalytics(c.req.raw, c.env.DB));
app.get('/block', (c) => handleBlock(c.env.DB));
app.get('/tags', (c) => handleTags(c.req.raw, c.env.DB));
app.get('/tags/asset/:asset', (c) => handleAssetTags(c.req.raw, c.env.DB, c.req.param('asset')));
app.get('/deals', (c) => handleDeals(c.req.raw, c.env.DB));
// Site-wide "how many people have xcpdex.com open right now" — one fixed room,
// every page connects to the same instance. Registered before the cache
// middleware's concerns because a websocket upgrade is not a cacheable GET.
app.get('/ws/presence', (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('expected a websocket upgrade', 426);
  }
  const id = c.env.SITE_PRESENCE.idFromName('global');
  return c.env.SITE_PRESENCE.get(id).fetch(c.req.raw);
});

// The unconfirmed side of the DEX, folded to one row per transaction and
// served from our edge so a thousand tabs are not a thousand calls to a public
// Counterparty node. See routes/mempool.ts.
app.get('/mempool', (c) => handleMempool(c.req.raw, c.env));

app.get('/pools', (c) => handlePools(c.req.raw, c.env.DB));
app.get('/pools/:lpAsset', (c) => handlePool(new URL(c.req.url), c.env.DB, c.req.param('lpAsset')));
// Reserves over time, straight from pool_updates — see pool-liquidity.ts.
app.get('/pools/:lpAsset/liquidity', (c) => handlePoolLiquidity(c.req.raw, c.env.DB, c.req.param('lpAsset')));
app.get('/pools/:lpAsset/addresses/:address', (c) => handlePoolAddress(new URL(c.req.url), c.env.DB, c.req.param('lpAsset'), c.req.param('address')));
app.get('/addresses/:address/pools', (c) => handleAddressPools(new URL(c.req.url), c.env.DB, c.req.param('address')));
// "Can this asset be swapped, and against what?" — decides whether the swap tab
// is offered at all. Deliberately not /pools?asset=, which computes fee and
// volume projections this question does not need.
app.get('/assets/:asset/pool-venue', (c) => handleAssetPoolVenue(new URL(c.req.url), c.env.DB, c.req.param('asset')));

// Aggregator Integration Routes (CoinGecko / CoinMarketCap ideal API specs)

app.get('/coingecko/pairs', (c) => handleCgPairs(c.req.raw, c.env.DB));
app.get('/coingecko/tickers', (c) => handleCgTickers(c.req.raw, c.env.DB));
app.get('/coingecko/orderbook', (c) => handleCgOrderbook(c.req.raw, c.env.DB));
app.get('/coingecko/historical_trades', (c) => handleCgHistoricalTrades(c.req.raw, c.env.DB));
app.get('/coinmarketcap/summary', (c) => handleCmcSummary(c.req.raw, c.env.DB));
app.get('/defillama/volume', (c) => handleDefiLlamaVolume(c.req.raw, c.env.DB, c.executionCtx));
app.get('/catalog/pairs', (c) => handleCatalogPairs(c.req.raw, c.env.DB));
app.get('/openapi.json', () =>
  Response.json(openapi, { headers: { 'Cache-Control': 'public, max-age=3600' } }));

// Swap Routes

app.get('/swaps', (c) => handleGetSwaps(c.req.raw, c.env.DB));
app.get('/swaps/:id', (c) => handleGetSwap(c.env.DB, c.req.param('id')));
app.post('/swaps/prepare-listing', (c) => handlePrepareListingPsbt(c.req.raw, c.env));
app.post('/swaps/complete-listing', (c) => handleCompleteListingPsbt(c.req.raw, c.env));
app.post('/swaps/:id/prepare-fill', (c) => handlePrepareFill(c.req.raw, c.env, c.req.param('id')));
app.post('/swaps/:id/complete-fill', (c) => handleCompleteFill(c.req.raw, c.env.DB, c.req.param('id')));
app.post('/swaps/:id/prepare-cancel', (c) => handlePrepareCancelSwap(c.env.DB, c.req.param('id')));
app.post('/swaps/:id/cancel', (c) => handleCancelSwap(c.req.raw, c.env.DB, c.req.param('id')));

// Status

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
  }, {
    // Seven unqualified COUNT(*)s, each O(table): ~1M rows read per call, of
    // which candles alone is 523,780 and was measured at 557ms. This route
    // sent no Cache-Control at all, and the cache middleware deliberately
    // stores only what asks to be stored -- so every single call ran all
    // seven against D1.
    //
    // Staleness costs a diagnostics endpoint nothing, and the TTL is matched
    // to Bitcoin rather than to a round number: blocks arrive about every ten
    // minutes, so none of these counters moves meaningfully inside five, and
    // the indexer's own last_block_index is in the body for anyone who needs
    // to judge freshness. 60s was tried first and was the wrong shape -- the
    // callers arrive further apart than that, so nearly every request still
    // missed and paid the full million rows.
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
});

// Indexer Routes (auth handled by middleware)

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
    deleteState(c.env.DB, "pool_snapshot_cursor"),
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
    deleteState(c.env.DB, "pool_snapshot_cursor"),
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

// Pull xcp.io's low-quality asset list and re-apply the hidden flags. Cron runs it daily; this is
// the manual trigger for when a market gets flagged upstream and should drop off our lists now.
app.post('/indexer/sync-low-quality', async (c) =>
  Response.json({ ok: true, ...await syncLowQualityAssets(c.env.DB) })
);

// Cron

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
        console.log(`Cron: backfill trades - ${r.inserted} inserted, ${r.progress}% done`);
        break;
      }
      case "BACKFILL_DISPENSES": {
        const r = await backfillDispenses(env.DB, env.CP_API_BASE, 20);
        console.log(`Cron: backfill dispenses - ${r.inserted} inserted, ${r.progress}% done`);
        break;
      }
      case "BACKFILL_DISPENSERS": {
        const r = await backfillDispensers(env.DB, env.CP_API_BASE, 20);
        console.log(`Cron: backfill dispensers - ${r.inserted} inserted, ${r.progress}% done`);
        break;
      }
      case "SNAPSHOT_SYNC": {
        const r = await runSnapshotStep(env.DB, env.CP_API_BASE);
        console.log(`Cron: snapshot sync - phase=${r.phase}, done=${r.done}`);
        break;
      }
      case "BUILD_AGGREGATES": {
        const r = await runCatchupAggregation(env.DB);
        console.log(`Cron: aggregation - done=${r.done}`);
        break;
      }
      case "REFRESH_STATS": {
        const statResult = await runCatchupStats(env.DB);
        const dispResult = await runCatchupDispenserStats(env.DB);
        console.log(`Cron: stats refresh - pairs=${statResult.processed}, dispensers=${dispResult.processed}`);
        if (statResult.done && dispResult.done) {
          await setMode(env.DB, "FOLLOWING");
        }
        break;
      }
      case "FOLLOWING": {
        await syncBlocks(env.DB, env.CP_API_BASE, 10);
        const sweepGate = async (key: string, seconds: number, run: () => Promise<unknown>) => {
          const row = await env.DB.prepare(`SELECT value FROM indexer_state WHERE key = ?`)
            .bind(key).first<{ value: string }>();
          if (now - Number(row?.value ?? 0) < seconds) return;
          await run();
          await env.DB.prepare(
            `INSERT INTO indexer_state (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`
          ).bind(key, String(now)).run();
        };
        // Rolling-window stats drift with TIME, not per block; pairs with fresh trades are already
        // updated inside syncBlocks. Sweeping every tick rewrote every active pair each 2 minutes
        // (~4.2M D1 rows/day billed), and half-hourly still repriced every windowed pair whether or
        // not a trade crossed a window boundary (~1M rows/day). Hourly keeps the stale sweeps a
        // rounding error; live pairs never wait on it.
        await sweepGate("pair_stats_swept_at", 3600, () => refreshStalePairStats(env.DB));
        await sweepGate("dispenser_stats_swept_at", 3600, () => refreshStaleDispenserStats(env.DB));
        // The year window covers an order of magnitude more rows than the 30-day
        // one, and a trade only leaves it once it is 365 days old — hourly rewrites
        // would burn D1 writes to change nothing. Daily is well inside the drift a
        // 365-day total can tolerate.
        // Reconcile pool reserves against Counterparty's own snapshot.
        //
        // Reserves were reaching this database ONLY through POOL_UPDATE events
        // in syncBlocks, with nothing ever checking the result against the
        // authoritative figure. When those events stopped being recorded, every
        // pool silently froze at its opening balances and no count looked wrong
        // -- match_count kept climbing the whole time, because it is derived
        // from a different table. That went unnoticed until someone read the
        // page and said the number looked off.
        //
        // Cheap enough to be unconditional insurance: 4 pools today, one
        // upstream page, and the sweep exists to disagree with the event
        // stream rather than to be the primary path. Hourly matches the other
        // stale sweeps here.
        await sweepGate("pool_snapshot_swept_at", 3600, () =>
          syncPools(env.DB, env.CP_API_BASE).catch((e) => console.error(`pool snapshot sweep failed: ${e}`))
        );
        await sweepGate("pair_stats_1y_swept_at", 86400, () => refreshLongWindowPairStats(env.DB));
        await sweepGate("dispenser_stats_1y_swept_at", 86400, () => refreshLongWindowDispenserStats(env.DB));
        // The full deal re-score exists for time decay; block-driven changes score incrementally in
        // syncBlocks. The unconditional call wiped and rebuilt the whole table every tick.
        await sweepGate("deal_scores_refreshed_at", 86400, () => refreshDealScores(env.DB));
        // xcp.io's low-quality list moves when a human reviews a ring-trade candidate — days apart,
        // not minutes. Daily, and a throw here must not take the rest of the tick down with it.
        await sweepGate("low_quality_synced_at", 86400, () =>
          syncLowQualityAssets(env.DB).catch((e) => console.error(`low-quality sync failed: ${e}`))
        );
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

export { SitePresence } from "./durable/site-presence";

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(scheduled(env));
  },
} satisfies ExportedHandler<Bindings>;
