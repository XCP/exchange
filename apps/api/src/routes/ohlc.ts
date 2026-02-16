import { INTERVAL_SECONDS, calendarBucket, nextBucket, walkBack } from "../lib/constants";

const VALID_INTERVALS = new Set(Object.keys(INTERVAL_SECONDS));

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
}

/**
 * Build a dense grid of candles for a fixed time window.
 *
 * Real candles are placed at their bucket timestamp; every other bucket
 * carries forward the previous close with volume 0.  Output size is
 * always exactly (windowEnd − windowStart) / step + 1 — bounded by
 * the time window, never by the sparsity of real data.
 *
 * If there's no seed price and no real candles have appeared yet in the
 * window, those leading buckets are skipped (no price to carry forward).
 */
function buildGrid(
  realCandles: Candle[],
  seedClose: number | null,
  windowStart: number,
  windowEnd: number,
  interval: string
): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of realCandles) {
    byTime.set(c.t, c);
  }

  const grid: Candle[] = [];
  let lastClose = seedClose;

  for (let ts = windowStart; ts <= windowEnd; ts = nextBucket(ts, interval)) {
    const real = byTime.get(ts);
    if (real) {
      grid.push(real);
      lastClose = real.c;
    } else if (lastClose !== null) {
      grid.push({
        t: ts,
        o: lastClose,
        h: lastClose,
        l: lastClose,
        c: lastClose,
        v: 0,
        n: 0,
      });
    }
    // No seed and no real candle seen yet — skip this bucket
  }

  return grid;
}

export async function handleOhlc(
  request: Request,
  db: D1Database,
  pair: string
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
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const now = Math.floor(Date.now() / 1000);
  const nowBucket = calendarBucket(now, interval);

  // Compute time window
  let windowEnd: number;
  let windowStart: number;

  if (fromParam && toParam) {
    windowEnd = calendarBucket(parseInt(toParam, 10), interval);
    // Clamp start so we don't exceed `limit` buckets
    const requestedStart = calendarBucket(parseInt(fromParam, 10), interval);
    const maxStart = walkBack(windowEnd, interval, limit - 1);
    windowStart = requestedStart < maxStart ? maxStart : requestedStart;
  } else if (fromParam) {
    windowStart = calendarBucket(parseInt(fromParam, 10), interval);
    windowEnd = nowBucket;
  } else if (toParam) {
    windowEnd = calendarBucket(parseInt(toParam, 10), interval);
    windowStart = walkBack(windowEnd, interval, limit - 1);
  } else {
    // Default: last `limit` buckets up to now
    windowEnd = nowBucket;
    windowStart = walkBack(nowBucket, interval, limit - 1);
  }

  // Two parallel queries:
  // 1. Real candles within the window
  // 2. Seed price (last close before the window, for carry-forward)
  const [realResult, seedResult] = await Promise.all([
    db
      .prepare(
        `SELECT timestamp, open, high, low, close, volume, trades
         FROM candles
         WHERE pair = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp ASC`
      )
      .bind(pair, interval, windowStart, windowEnd)
      .all<{
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
        trades: number;
      }>(),
    db
      .prepare(
        `SELECT close FROM candles
         WHERE pair = ? AND interval = ? AND timestamp < ?
         ORDER BY timestamp DESC LIMIT 1`
      )
      .bind(pair, interval, windowStart)
      .first<{ close: number }>(),
  ]);

  const realCandles: Candle[] = realResult.results.map((c) => ({
    t: c.timestamp,
    o: c.open,
    h: c.high,
    l: c.low,
    c: c.close,
    v: c.volume,
    n: c.trades,
  }));

  const seedClose = seedResult?.close ?? null;
  const candles = buildGrid(realCandles, seedClose, windowStart, windowEnd, interval);

  return Response.json(
    { pair, interval, candles },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
