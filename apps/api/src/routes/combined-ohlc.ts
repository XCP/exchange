import { calendarBucket, nextBucket } from "../lib/constants";
import { cacheControl } from "../utils/cache";
import { buildGrid, resolveWindow, VALID_INTERVALS, type Candle } from "./ohlc";
import { rollUp, type DispenseRow } from "./dispense-ohlc";

const MAX_ROWS = 60_000;

/**
 * One price series for an asset quoted in BITCOIN, across both venues that
 * actually price it that way: the XCP/BTC order book (plus its AMM pool, which
 * already shares the candle table) and dispenser sales.
 *
 * WHY THIS IS SAFE HERE AND NOT IN GENERAL. dispense-ohlc.ts declines to blend
 * venues, and it is right to: a dispense is paid in bitcoin while a pair like
 * PEPECASH/XCP is priced in XCP, so merging them needs a BTC<->XCP rate and
 * would quietly invent a number. That objection is about DENOMINATION, and it
 * disappears when the quote asset IS bitcoin — an XCP/BTC match and an XCP
 * dispense are both already BTC-per-XCP. Nothing is converted, so nothing is
 * invented. The guard below enforces exactly that: BTC-quoted pairs only.
 *
 * WHY IT MATTERS. Measured over the 365 days to 2026-08-25, on-chain XCP/BTC:
 * the order book saw 5 days and SIX fills, dispensers saw 325 days and 1,635
 * fills — 30x the volume. Charting the book alone is not a conservative choice,
 * it is a chart of 3% of the market with the other 97% behind a toggle.
 *
 * WHAT IS APPROXIMATED. A candle row stores aggregated OHLC with no record of
 * WHEN inside its bucket each trade landed, so when both venues trade in the
 * same bucket their opens and closes cannot be ordered against each other.
 * High, low, volume and trade count combine exactly; open and close are
 * volume-weighted. With the book trading five days a year that approximation
 * touches a handful of buckets annually, and in every other bucket the
 * combined candle IS the single active venue's candle, untouched.
 */
/**
 * Merge two venues' candles bucket by bucket.
 *
 * A bucket only one venue traded in passes through UNTOUCHED — which is nearly
 * every bucket, given the book trades about five days a year. Where both
 * traded, high/low/volume/trades combine exactly; open and close are
 * volume-weighted because a candle row records no intra-bucket ordering, so
 * there is no fact about which venue printed first to preserve.
 */
export function mergeVenueCandles(book: Candle[], dispense: Candle[]): Candle[] {
  const merged = new Map<number, Candle>();
  for (const c of book) merged.set(c.t, c);
  for (const d of dispense) {
    const b = merged.get(d.t);
    if (!b) {
      merged.set(d.t, d);
      continue;
    }
    const w = b.v + d.v;
    // Equal weighting when neither venue reports volume: without weights there
    // is nothing to prefer, and dropping one end silently would be worse.
    const blend = (x: number, y: number) => (w > 0 ? (x * b.v + y * d.v) / w : (x + y) / 2);
    merged.set(d.t, {
      t: d.t,
      o: blend(b.o, d.o),
      h: Math.max(b.h, d.h),
      l: Math.min(b.l, d.l),
      c: blend(b.c, d.c),
      v: w,
      n: b.n + d.n,
    });
  }
  return [...merged.values()].sort((a, b) => a.t - b.t);
}

export async function handleCombinedOhlc(
  request: Request,
  db: D1Database,
  pair: string
): Promise<Response> {
  const url = new URL(request.url);
  const interval = url.searchParams.get("interval");
  if (!interval || !VALID_INTERVALS.has(interval)) {
    return Response.json({ error: "interval required: 1h, 4h, 1d, 1w, 1m, 1y" }, { status: 400 });
  }

  const [base, quote] = pair.split("_");
  if (quote !== "BTC" || !base) {
    // Refusing is the whole point — see the denomination note above. A caller
    // asking to blend an XCP-quoted pair with BTC-priced dispenses is asking
    // for a cross-rate we will not silently fabricate.
    return Response.json(
      { error: "venue=all is only defined for BTC-quoted pairs; both venues must already price in BTC" },
      { status: 400 }
    );
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "300", 10) || 300, 500);
  const { windowStart, windowEnd } = resolveWindow(url, interval, limit);

  const [bookRows, dispenseRows, bookSeed, dispenseSeed] = await Promise.all([
    db
      .prepare(
        `SELECT timestamp, open, high, low, close, volume, trades
         FROM candles
         WHERE pair = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp ASC`
      )
      .bind(pair, interval, windowStart, windowEnd)
      .all<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number; trades: number }>(),
    db
      .prepare(
        `SELECT d.block_time, COALESCE(p.price, d.price) AS price, d.dispense_quantity
         FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
         WHERE d.asset = ? AND COALESCE(p.price, d.price) > 0
           AND d.block_time >= ? AND d.block_time < ?
         ORDER BY d.block_time DESC, d.id DESC
         LIMIT ?`
      )
      .bind(base, windowStart, nextBucket(windowEnd, interval), MAX_ROWS)
      .all<DispenseRow>(),
    db
      .prepare(
        `SELECT timestamp, close FROM candles
         WHERE pair = ? AND interval = ? AND timestamp < ?
         ORDER BY timestamp DESC LIMIT 1`
      )
      .bind(pair, interval, windowStart)
      .first<{ timestamp: number; close: number }>(),
    db
      .prepare(
        `SELECT d.block_time, COALESCE(p.price, d.price) AS price
         FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
         WHERE d.asset = ? AND COALESCE(p.price, d.price) > 0 AND d.block_time < ?
         ORDER BY d.block_time DESC, d.id DESC LIMIT 1`
      )
      .bind(base, windowStart)
      .first<{ block_time: number; price: number }>(),
  ]);

  const merged = mergeVenueCandles(
    bookRows.results.map((c) => ({ t: c.timestamp, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, n: c.trades })),
    // Oldest-first, because rollUp's running last-write IS the close.
    rollUp([...dispenseRows.results].reverse(), interval)
  );

  // Carry-forward seed: whichever venue printed LAST before the window. Taking
  // the book's by default would carry a price from a market that trades five
  // days a year across every gap in one that trades most of them.
  const seedClose =
    bookSeed && dispenseSeed
      ? bookSeed.timestamp >= dispenseSeed.block_time
        ? bookSeed.close
        : dispenseSeed.price
      : (bookSeed?.close ?? dispenseSeed?.price ?? null);

  const candles = buildGrid(
    merged,
    seedClose,
    windowStart,
    windowEnd,
    interval
  );

  return Response.json(
    { pair, interval, venue: "all", candles },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}
