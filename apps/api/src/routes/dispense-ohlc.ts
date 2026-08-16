import { calendarBucket, nextBucket } from "../lib/constants";
import { cacheControl } from "../utils/cache";
import { buildGrid, resolveWindow, VALID_INTERVALS, type Candle } from "./ohlc";

/**
 * OHLC for an asset's dispenser sales.
 *
 * The third venue. Order-book matches and pool swaps already share the
 * `trades` table and so already share one candle series (`/ohlc/:pair`), but
 * dispenses can't join them: a dispense is paid in BITCOIN, while a DEX pair
 * like PEPECASH/XCP is priced in XCP. Putting both on one axis would need a
 * BTC↔XCP rate we can't source from our own data — the XCP/BTC book has 2
 * real trade days in the last 365 — so this is a separate series in its own
 * denomination rather than a blend that would quietly invent a number.
 *
 * The response shape is identical to `/ohlc/:pair` on purpose, down to the
 * dense carry-forward grid, so the same chart component and hook render
 * either one without knowing which venue it is looking at.
 *
 * Computed on the fly rather than pre-aggregated into a table like
 * `candles`. Measured against production: 207,307 dispenses across 19,576
 * assets, and the heaviest single asset (ORDIPEPE) has 20,692 — then OXBT
 * 18,707, XCP 18,380, PEPECASH 5,306. One asset's whole history is a single
 * indexed scan on `idx_dispenses_asset_time (asset, block_time)` that
 * collapses to at most 500 candles before it is serialised, behind a 60s
 * cache. A rollup table plus indexer wiring buys nothing at that size.
 */

/**
 * Ceiling on the raw scan, with roughly 3x headroom over the biggest asset.
 *
 * Sized against the real table rather than a guess: an earlier figure of
 * 20,000 came from a public endpoint that silently returned only its first
 * page, and would have clipped the busiest asset by 692 rows.
 */
const MAX_ROWS = 60_000;

export interface DispenseRow {
  block_time: number;
  price: number;
  dispense_quantity: number;
}

/**
 * Roll raw dispenses into candles.
 *
 * Bucketed in JS rather than SQL because two of the six intervals are
 * calendar-based — a month and a year aren't fixed multiples of seconds, so
 * `(block_time / step) * step` would silently drift. `calendarBucket` is the
 * same function the trade aggregator uses, which is what keeps the two
 * series' buckets aligned.
 */
export function rollUp(rows: DispenseRow[], interval: string): Candle[] {
  const buckets = new Map<number, Candle>();

  for (const r of rows) {
    const t = calendarBucket(r.block_time, interval);
    const existing = buckets.get(t);
    if (!existing) {
      buckets.set(t, {
        t,
        o: r.price,
        h: r.price,
        l: r.price,
        c: r.price,
        v: r.dispense_quantity,
        n: 1,
      });
      continue;
    }
    // Rows arrive oldest-first, so the running last write IS the close.
    existing.c = r.price;
    if (r.price > existing.h) existing.h = r.price;
    if (r.price < existing.l) existing.l = r.price;
    existing.v += r.dispense_quantity;
    existing.n++;
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export async function handleDispenseOhlc(
  request: Request,
  db: D1Database,
  asset: string
): Promise<Response> {
  const url = new URL(request.url);
  const interval = url.searchParams.get("interval");
  if (!interval || !VALID_INTERVALS.has(interval)) {
    return Response.json(
      { error: "interval required: 1h, 4h, 1d, 1w, 1m, 1y" },
      { status: 400 }
    );
  }

  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "300", 10) || 300,
    500
  );
  const { windowStart, windowEnd } = resolveWindow(url, interval, limit);

  // `price` is BTC per whole token, already normalized for divisibility at
  // index time. Zero means the per-unit price rounded below a satoshi, which
  // is a storage artefact rather than a real sale price — charting it would
  // draw a spike to the floor.
  const [rowsResult, seedResult] = await Promise.all([
    db
      .prepare(
        `SELECT block_time, price, dispense_quantity
         FROM dispenses
         WHERE asset = ? AND price > 0 AND block_time >= ? AND block_time < ?
         ORDER BY block_time DESC, id DESC
         LIMIT ?`
      )
      // `windowEnd` is the last bucket's START, so the scan has to reach the
      // start of the bucket after it or the newest sales fall outside it.
      //
      // Ordered NEWEST-first so that if MAX_ROWS ever does bite, it drops the
      // oldest history rather than the most recent sales. Truncating the
      // newest end would draw a chart that simply stops partway, which reads
      // as "this asset stopped trading" — a wrong answer rather than a short
      // one. Reversed below, since the roll-up needs oldest-first.
      .bind(asset, windowStart, nextBucket(windowEnd, interval), MAX_ROWS)
      .all<DispenseRow>(),
    db
      .prepare(
        `SELECT price FROM dispenses
         WHERE asset = ? AND price > 0 AND block_time < ?
         ORDER BY block_time DESC, id DESC LIMIT 1`
      )
      .bind(asset, windowStart)
      .first<{ price: number }>(),
  ]);

  // Back to oldest-first: the roll-up's running last-write IS the close.
  const ordered = [...rowsResult.results].reverse()

  const candles = buildGrid(
    rollUp(ordered, interval),
    seedResult?.price ?? null,
    windowStart,
    windowEnd,
    interval
  );

  return Response.json(
    { asset, interval, quote: "BTC", candles },
    {
      headers: {
        "Cache-Control": cacheControl(url, 60),
      },
    }
  );
}
