import { makePairString } from "./pairs";

/**
 * Shared 24h market aggregation for the CoinGecko / CoinMarketCap
 * integration endpoints.
 *
 * Venue definition: completed order-book trades (incl. pool fills already
 * folded into `trades`) for all pairs, PLUS dispenser fills for BTC-quoted
 * pairs. Dispensers are one-sided sell offers settled in BTC, so they only
 * ever contribute to *_BTC markets.
 *
 * Dispenser accounting: one BTC payment can trigger dispensers for several
 * assets at the same address, and Counterparty records the FULL payment on
 * every resulting dispense row — so summing stored btc_amount double-counts,
 * and stored price (btc/qty) is inflated on shared rows. All dispense prices
 * and quote volumes here are therefore protocol-priced notional instead:
 * dispense_quantity x the dispenser's own per-unit price (satoshirate-derived,
 * joined via dispenser_tx_hash). Gross BTC paid is never used as market volume.
 *
 * Each consumer feed has an explicit allowlist, not an activity heuristic.
 * The lists may currently overlap, but are intentionally separate so one
 * aggregator's asset policy does not silently change another's feed. Every
 * query below is a per-pair indexed lookup (no table scans), so a request costs
 * tens of rows read regardless of database size.
 */

// Current and historical Counterparty DEX markets for assets with a verified
// CoinMarketCap UCID. Do not add a market here merely because it trades on the
// protocol; first verify the underlying asset and record its UCID in the CMC
// adapter. MAGICFLDC has no verified CMC listing, and CMC's BITCORN/CORN is a
// different asset, so both are intentionally absent from this profile.
export const COINMARKETCAP_PAIRS: readonly string[] = [
  "XCP_BTC",
  "PEPECASH_XCP", "PEPECASH_BTC",
  "BITCRYSTALS_XCP", "BITCRYSTALS_BTC",
  "SCOTCOIN_XCP", "SCOTCOIN_BTC",
  "SJCX_XCP", "SJCX_BTC",
  "LTBCOIN_XCP", "LTBCOIN_BTC",
  "FLDC_XCP", "FLDC_BTC",
  "ZAIF_XCP", "ZAIF_BTC",
  "RUSTBITS_XCP", "RUSTBITS_BTC",
];

// Initial CoinGecko submission profile. Keep this to the unambiguous,
// already-listed Counterparty (XCP) market. Counterparty PEPECASH,
// BITCRYSTALS, BITCORN, and other assets require distinct CoinGecko identity
// approval before their markets can be added without symbol collisions.
export const COINGECKO_PAIRS: readonly string[] = [
  "XCP_BTC",
];

/** All pairs needed by shared catalog/reconciliation surfaces. */
export const INTEGRATION_PAIRS: readonly string[] = [
  ...new Set([...COINMARKETCAP_PAIRS, ...COINGECKO_PAIRS]),
];

/** A market with no completed fill in this window reports is_stale: true. */
export const STALE_AFTER_SECONDS = 90 * 86400;

export interface MarketSummary {
  pair: string;
  base: string;
  quote: string;
  lastPrice: number;
  lastTime: number | null; // unix seconds
  baseVolume24h: number;
  quoteVolume24h: number;
  high24h: number | null;
  low24h: number | null;
  priceChangePct24h: number;
  bestBid: number | null;
  bestAsk: number | null;
}

/** Fixed 8-decimal string for QUANTITIES and volumes (satoshi-level units). */
export function dec(n: number | null | undefined): string {
  return (n ?? 0).toFixed(8);
}

/**
 * Full-precision non-scientific decimal string for unit PRICES. Eight decimals
 * silently zero out sub-satoshi unit prices (1 sat for 1000 units = 1e-11);
 * this keeps every significant digit the stored double carries.
 */
export function decPrice(n: number | null | undefined): string {
  const v = n ?? 0;
  if (!Number.isFinite(v) || v <= 0) return "0";
  const s = String(v); // shortest round-trip representation
  const m = s.match(/^(\d+)(?:\.(\d+))?e-(\d+)$/);
  if (!m) return s;
  const digits = m[1] + (m[2] ?? "");
  const exponent = parseInt(m[3], 10);
  return "0." + "0".repeat(exponent - m[1].length) + digits;
}

/**
 * Parse a BASE_QUOTE ticker_id. Counterparty asset names never contain
 * underscores, so a single split is unambiguous.
 */
export function parseTickerId(tickerId: string): { base: string; quote: string; pair: string } | null {
  if (!/^[A-Za-z0-9.]+_[A-Za-z0-9.]+$/.test(tickerId)) return null;
  const [base, quote] = tickerId.split("_");
  return { base, quote, pair: makePairString(base, quote) };
}

interface PairDef {
  pair: string;
  base: string;
  quote: string;
}

function pairDefinitions(pairs: readonly string[]): PairDef[] {
  return pairs.map((pair) => {
    const [base, quote] = pair.split("_");
    return { pair, base, quote };
  });
}

export function isIntegrationPair(
  pair: string,
  pairs: readonly string[] = INTEGRATION_PAIRS
): boolean {
  return pairs.includes(pair);
}

/**
 * A Counterparty order that receives BTC is not fully executable until its
 * separate BTCPay settles. Publishing that intent as live depth lets an
 * uncommitted BTC leg spoof the book, so aggregator books use open orders only
 * when both sides are protocol assets. Completed BTC order matches remain in
 * trades, prices, and volume; escrow-backed dispensers remain executable asks.
 */
export function includesOpenOrderBook(quote: string): boolean {
  return quote !== "BTC";
}

interface PairStatRow {
  pair: string;
  last_price: number | null;
  last_trade_time: number | null;
}

interface DispenserStatRow {
  asset: string;
  cheapest_price: number | null;
}

interface TradeAggRow {
  pair: string;
  bv: number;
  qv: number;
  high: number;
  low: number;
}

interface OpenRow {
  pair: string;
  price: number;
  block_time: number;
}

interface DispenseAggRow {
  asset: string;
  bv: number;
  qv: number;
  high: number;
  low: number;
}

interface DispenseOpenRow {
  asset: string;
  price: number;
  block_time: number;
}

interface LastDispenseRow {
  asset: string;
  price: number;
  block_time: number;
}

interface BookRow {
  pair: string;
  best_bid: number | null;
  best_ask: number | null;
}

// Protocol-priced per-unit dispense price: the dispenser's own rate when the
// row is still on file, the stored per-row price otherwise (single-asset
// payments only ever differ by overpayment, which the rate excludes).
const DISPENSE_PRICE = `COALESCE(p.price, d.price)`;

/** Exported for the node:sqlite regression test that encodes the shared-payment
 *  pathology: one BTC output triggering many dispensers, the full payment
 *  stamped on every dispense row. Quote volume must be protocol-priced
 *  notional, never a multiple of the payment. */
export const DISPENSE_AGG_SQL = (assetPlaceholders: string) =>
  `SELECT d.asset, SUM(d.dispense_quantity) AS bv,
          SUM(d.dispense_quantity * ${DISPENSE_PRICE}) AS qv,
          MAX(${DISPENSE_PRICE}) AS high, MIN(${DISPENSE_PRICE}) AS low
   FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
   WHERE d.asset IN (${assetPlaceholders}) AND d.block_time >= ?
   GROUP BY d.asset`;

/**
 * Compute rolling 24h summaries for the allowlisted pairs. Every statement
 * is a primary-key or (pair|asset, block_time) index lookup.
 */
export async function getMarketSummaries(
  db: D1Database,
  pairs: readonly string[] = INTEGRATION_PAIRS
): Promise<MarketSummary[]> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff24h = now - 86400;
  const pairDefs = pairDefinitions(pairs);

  const pairPh = pairDefs.map(() => "?").join(",");
  const pairBinds = pairDefs.map((d) => d.pair);
  const btcBases = pairDefs.filter((d) => d.quote === "BTC").map((d) => d.base);
  const basePh = btcBases.map(() => "?").join(",");

  const stmts = [
    db.prepare(
      `SELECT pair, last_price, last_trade_time FROM pair_stats WHERE pair IN (${pairPh})`
    ).bind(...pairBinds),
    db.prepare(
      `SELECT pair,
              MAX(CASE WHEN side = 'bid' THEN price END) AS best_bid,
              MIN(CASE WHEN side = 'ask' THEN price END) AS best_ask
       FROM orders
       WHERE pair IN (${pairPh}) AND status = 'open' AND remaining > 0
       GROUP BY pair`
    ).bind(...pairBinds),
    db.prepare(
      `SELECT pair, SUM(amount) AS bv, SUM(volume) AS qv,
              MAX(price) AS high, MIN(price) AS low
       FROM trades
       WHERE pair IN (${pairPh}) AND block_time >= ?
       GROUP BY pair`
    ).bind(...pairBinds, cutoff24h),
    db.prepare(
      `SELECT pair, price, block_time FROM (
         SELECT pair, price, block_time,
                ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time ASC, id ASC) AS rn
         FROM trades WHERE pair IN (${pairPh}) AND block_time >= ?
       ) WHERE rn = 1`
    ).bind(...pairBinds, cutoff24h),
  ];

  if (btcBases.length > 0) {
    stmts.push(
      db.prepare(
        `SELECT asset, cheapest_price FROM dispenser_stats WHERE asset IN (${basePh})`
      ).bind(...btcBases),
      db.prepare(DISPENSE_AGG_SQL(basePh)).bind(...btcBases, cutoff24h),
      db.prepare(
        `SELECT asset, price, block_time FROM (
           SELECT d.asset, ${DISPENSE_PRICE} AS price, d.block_time,
                  ROW_NUMBER() OVER (PARTITION BY d.asset ORDER BY d.block_time ASC, d.id ASC) AS rn
           FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
           WHERE d.asset IN (${basePh}) AND d.block_time >= ?
         ) WHERE rn = 1`
      ).bind(...btcBases, cutoff24h),
      // Last completed dispense per asset, protocol-priced — one indexed
      // LIMIT 1 probe per asset instead of trusting dispenser_stats, whose
      // last price is derived from the inflatable stored per-row price.
      ...btcBases.map((asset) =>
        db.prepare(
          `SELECT d.asset, ${DISPENSE_PRICE} AS price, d.block_time
           FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
           WHERE d.asset = ? ORDER BY d.block_time DESC, d.id DESC LIMIT 1`
        ).bind(asset)
      )
    );
  }

  const results = await db.batch(stmts);
  const pairStats = results[0].results as unknown as PairStatRow[];
  const book = results[1].results as unknown as BookRow[];
  const tradeAgg = results[2].results as unknown as TradeAggRow[];
  const tradeOpen = results[3].results as unknown as OpenRow[];
  const dispenserStats = btcBases.length > 0 ? (results[4].results as unknown as DispenserStatRow[]) : [];
  const dispenseAgg = btcBases.length > 0 ? (results[5].results as unknown as DispenseAggRow[]) : [];
  const dispenseOpen = btcBases.length > 0 ? (results[6].results as unknown as DispenseOpenRow[]) : [];
  const lastDispenses = btcBases.length > 0
    ? results.slice(7).flatMap((r) => r.results as unknown as LastDispenseRow[])
    : [];

  const pairStatByPair = new Map(pairStats.map((r) => [r.pair, r]));
  const bookByPair = new Map(book.map((r) => [r.pair, r]));
  const tradeAggByPair = new Map(tradeAgg.map((r) => [r.pair, r]));
  const tradeOpenByPair = new Map(tradeOpen.map((r) => [r.pair, r]));
  const dispenserStatByAsset = new Map(dispenserStats.map((r) => [r.asset, r]));
  const dispenseAggByAsset = new Map(dispenseAgg.map((r) => [r.asset, r]));
  const dispenseOpenByAsset = new Map(dispenseOpen.map((r) => [r.asset, r]));
  const lastDispenseByAsset = new Map(lastDispenses.map((r) => [r.asset, r]));

  const summaries: MarketSummary[] = [];

  for (const def of pairDefs) {
    const isBtcPair = def.quote === "BTC";
    const stat = pairStatByPair.get(def.pair);

    const s: MarketSummary = {
      pair: def.pair,
      base: def.base,
      quote: def.quote,
      lastPrice: stat?.last_price ?? 0,
      lastTime: stat?.last_trade_time ?? null,
      baseVolume24h: 0,
      quoteVolume24h: 0,
      high24h: null,
      low24h: null,
      priceChangePct24h: 0,
      bestBid: null,
      bestAsk: null,
    };

    const trades = tradeAggByPair.get(def.pair);
    const disp = isBtcPair ? dispenseAggByAsset.get(def.base) : undefined;

    if (trades) {
      s.baseVolume24h += trades.bv;
      s.quoteVolume24h += trades.qv;
      s.high24h = trades.high;
      s.low24h = trades.low;
    }
    if (disp) {
      s.baseVolume24h += disp.bv;
      s.quoteVolume24h += disp.qv;
      s.high24h = s.high24h == null ? disp.high : Math.max(s.high24h, disp.high);
      s.low24h = s.low24h == null ? disp.low : Math.min(s.low24h, disp.low);
    }

    // Last price: later of last order-book trade and last dispense.
    if (isBtcPair) {
      const lastDispense = lastDispenseByAsset.get(def.base);
      if (
        lastDispense != null &&
        lastDispense.price > 0 &&
        (s.lastTime == null || lastDispense.block_time > s.lastTime)
      ) {
        s.lastPrice = lastDispense.price;
        s.lastTime = lastDispense.block_time;
      }
    }

    // 24h change vs the earliest completed fill inside the window.
    const tOpen = tradeOpenByPair.get(def.pair);
    const dOpen = isBtcPair ? dispenseOpenByAsset.get(def.base) : undefined;
    let open: number | null = null;
    if (tOpen && dOpen) open = tOpen.block_time <= dOpen.block_time ? tOpen.price : dOpen.price;
    else open = tOpen?.price ?? dOpen?.price ?? null;
    if (open != null && open > 0 && s.lastPrice > 0) {
      s.priceChangePct24h = ((s.lastPrice - open) / open) * 100;
    }

    // BTC-quoted open order intents are not committed liquidity. Completed
    // BTCPays still feed the settlement aggregates above; only their resting
    // quotes are omitted here. Dispensers remain executable, escrowed asks.
    if (includesOpenOrderBook(def.quote)) {
      const b = bookByPair.get(def.pair);
      s.bestBid = b?.best_bid ?? null;
      s.bestAsk = b?.best_ask ?? null;
    }
    if (isBtcPair) {
      const dAsk = dispenserStatByAsset.get(def.base)?.cheapest_price;
      if (dAsk != null) s.bestAsk = dAsk;
    }

    if (s.lastPrice > 0) summaries.push(s);
  }

  return summaries;
}
