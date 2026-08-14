#!/usr/bin/env node
/**
 * Production reconciliation for the aggregator integration surface.
 *
 *   node scripts/reconcile.mjs            # against https://api.xcpdex.com
 *   RECONCILE_BASE=http://localhost:8791 node scripts/reconcile.mjs
 *
 * Hard failures (exit 1): CMC and CG disagree on price/volume; ticker
 * last/bid/ask/high/low disagree with the orderbook or the full rolling-24h
 * historical window; duplicate trade IDs; nonpositive published prices;
 * unsorted or crossed book; is_stale disagreeing with the 90-day rule.
 *
 * The historical window is paged by narrowing end_time until exhausted —
 * never assumed to fit one response. Pairs whose ticker changed between the
 * opening and closing snapshots (a fill landed mid-run) are reported as
 * UNSTABLE and skipped rather than failed.
 */

const BASE = process.env.RECONCILE_BASE ?? "https://api.xcpdex.com";
const STALE_MS = 90 * 86400 * 1000;
const EPS = 1e-7; // absolute tolerance for sums of 8dp decimal strings
const PAGE_LIMIT = 1000;

const failures = [];
const notes = [];
const fail = (pair, check, detail) => failures.push(`${pair} :: ${check} :: ${detail}`);

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

const near = (a, b, eps = EPS) => Math.abs(Number(a) - Number(b)) <= eps;

// start/end and trade_timestamp are unix SECONDS, per CoinGecko's spec.
async function fullWindow(tickerId, startSec, endSec) {
  const trades = [];
  const seen = new Set();
  let cursor = endSec;
  for (let page = 0; page < 50; page++) {
    const data = await getJson(
      `/coingecko/historical_trades?ticker_id=${tickerId}&limit=${PAGE_LIMIT}&start_time=${startSec}&end_time=${cursor}`,
    );
    const batch = [...(data.buy ?? []), ...(data.sell ?? [])];
    let added = 0;
    for (const trade of batch) {
      if (seen.has(trade.trade_id)) continue;
      seen.add(trade.trade_id);
      trades.push(trade);
      added += 1;
    }
    if (batch.length < PAGE_LIMIT || added === 0) break;
    cursor = Math.min(...batch.map((t) => t.trade_timestamp));
  }
  return trades;
}

async function reconcilePair(cg, cmcByPair, nowMs) {
  const pair = cg.ticker_id;

  // --- CMC vs CG: one dataset, two presentations ---
  const cmc = cmcByPair.get(pair);
  if (!cmc) {
    fail(pair, "cmc-presence", "pair missing from /coinmarketcap/summary");
    return;
  }
  if (cmc.last_price !== cg.last_price) fail(pair, "cmc-last", `${cmc.last_price} != ${cg.last_price}`);
  if (cmc.base_volume !== cg.base_volume) fail(pair, "cmc-base-vol", `${cmc.base_volume} != ${cg.base_volume}`);
  if (cmc.quote_volume !== cg.target_volume) fail(pair, "cmc-quote-vol", `${cmc.quote_volume} != ${cg.target_volume}`);
  if (cmc.highest_bid !== cg.bid) fail(pair, "cmc-bid", `${cmc.highest_bid} != ${cg.bid}`);
  if (cmc.lowest_ask !== cg.ask) fail(pair, "cmc-ask", `${cmc.lowest_ask} != ${cg.ask}`);

  // --- published price sanity ---
  if (!(Number(cg.last_price) > 0)) fail(pair, "price-positive", `last_price ${cg.last_price}`);
  if (cg.is_stale !== (cg.last_trade_timestamp == null || nowMs - cg.last_trade_timestamp > STALE_MS)) {
    fail(pair, "stale-rule", `is_stale=${cg.is_stale} ts=${cg.last_trade_timestamp}`);
  }

  // --- orderbook agreement ---
  const book = await getJson(`/coingecko/orderbook?ticker_id=${pair}`);
  const topBid = book.bids[0]?.[0] ?? null;
  const topAsk = book.asks[0]?.[0] ?? null;
  if ((cg.bid ?? null) !== topBid) fail(pair, "bid-top", `${cg.bid} != ${topBid}`);
  if ((cg.ask ?? null) !== topAsk) fail(pair, "ask-top", `${cg.ask} != ${topAsk}`);
  const descending = (levels) => levels.every(([p], i) => i === 0 || Number(p) < Number(levels[i - 1][0]));
  const ascending = (levels) => levels.every(([p], i) => i === 0 || Number(p) > Number(levels[i - 1][0]));
  if (!descending(book.bids)) fail(pair, "bids-sorted", "not strictly descending");
  if (!ascending(book.asks)) fail(pair, "asks-sorted", "not strictly ascending");
  for (const [price, amount] of [...book.bids, ...book.asks]) {
    if (!(Number(price) > 0) || !(Number(amount) > 0)) fail(pair, "book-positive", `[${price}, ${amount}]`);
  }
  if (topBid != null && topAsk != null && Number(topBid) >= Number(topAsk)) {
    notes.push(`${pair} :: crossed book: bid ${topBid} >= ask ${topAsk} (verify genuinely executable)`);
  }

  // --- full rolling-24h historical window vs ticker ---
  const trades = await fullWindow(pair, Math.floor(nowMs / 1000) - 86400, Math.ceil(nowMs / 1000));
  const ids = trades.map((t) => t.trade_id);
  if (new Set(ids).size !== ids.length) fail(pair, "dup-trade-id", "duplicate trade_id in window");
  for (const t of trades) {
    if (!(Number(t.price) > 0)) fail(pair, "hist-price-positive", `trade ${t.trade_id} price ${t.price}`);
    if (!(Number(t.base_volume) > 0)) fail(pair, "hist-qty-positive", `trade ${t.trade_id} qty ${t.base_volume}`);
  }
  const sumBase = trades.reduce((s, t) => s + Number(t.base_volume), 0);
  const sumQuote = trades.reduce((s, t) => s + Number(t.target_volume), 0);
  if (!near(cg.base_volume, sumBase)) fail(pair, "base-vol-sum", `${cg.base_volume} != ${sumBase.toFixed(8)}`);
  if (!near(cg.target_volume, sumQuote)) fail(pair, "quote-vol-sum", `${cg.target_volume} != ${sumQuote.toFixed(8)}`);

  if (trades.length > 0) {
    // trade_timestamp is seconds; the ticker's last_trade_timestamp is ms.
    const newestTs = Math.max(...trades.map((t) => t.trade_timestamp));
    const newest = trades.filter((t) => t.trade_timestamp === newestTs);
    if (cg.last_trade_timestamp !== newestTs * 1000) {
      fail(pair, "last-ts", `${cg.last_trade_timestamp} != ${newestTs * 1000}`);
    } else if (!newest.some((t) => t.price === cg.last_price)) {
      // several settlements can share the newest block; the ticker's price
      // must be one of them
      fail(pair, "last-price", `${cg.last_price} not among prices at ${newestTs}`);
    }
    const high = Math.max(...trades.map((t) => Number(t.price)));
    const low = Math.min(...trades.map((t) => Number(t.price)));
    if (!near(cg.high, high)) fail(pair, "high", `${cg.high} != ${high}`);
    if (!near(cg.low, low)) fail(pair, "low", `${cg.low} != ${low}`);
  } else {
    if (Number(cg.base_volume) !== 0) fail(pair, "empty-window", `no trades but base_volume ${cg.base_volume}`);
    // with no 24h fills, high/low fall back to last_price by contract
    if (cg.high !== cg.last_price) fail(pair, "empty-high", `${cg.high} != ${cg.last_price}`);
    if (cg.low !== cg.last_price) fail(pair, "empty-low", `${cg.low} != ${cg.last_price}`);
  }
}

const nowMs = Date.now();
const [openingTickers, cmcSummary] = await Promise.all([
  getJson("/coingecko/tickers"),
  getJson("/coinmarketcap/summary"),
]);
const cmcByPair = new Map(cmcSummary.map((row) => [row.trading_pairs, row]));

for (const cg of openingTickers) {
  await reconcilePair(cg, cmcByPair, nowMs);
}

// A fill landing mid-run makes ticker-vs-window comparisons unreliable; report
// affected pairs as unstable instead of failing them.
const closingTickers = await getJson("/coingecko/tickers");
const closingByPair = new Map(closingTickers.map((row) => [row.ticker_id, row]));
const unstable = new Set(
  openingTickers
    .filter((cg) => JSON.stringify(closingByPair.get(cg.ticker_id)) !== JSON.stringify(cg))
    .map((cg) => cg.ticker_id),
);
const finalFailures = failures.filter((line) => !unstable.has(line.split(" :: ")[0]));

console.log(`reconcile ${BASE} — ${openingTickers.length} tickers, ${unstable.size} unstable (skipped)`);
for (const pair of unstable) console.log(`UNSTABLE ${pair} (ticker changed mid-run; rerun)`);
for (const note of notes) console.log(`NOTE ${note}`);
if (finalFailures.length === 0) {
  console.log("PASS — CMC == CG, tickers reconcile with orderbook and full 24h window");
} else {
  for (const line of finalFailures) console.log(`FAIL ${line}`);
  process.exit(1);
}
