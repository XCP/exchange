import { INTERVAL_SECONDS } from "../lib/constants";

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
  step: number
): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of realCandles) {
    byTime.set(c.t, c);
  }

  const grid: Candle[] = [];
  let lastClose = seedClose;

  for (let ts = windowStart; ts <= windowEnd; ts += step) {
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

  const step = INTERVAL_SECONDS[interval];
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "300", 10) || 300,
    500
  );
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const now = Math.floor(Date.now() / 1000);
  const nowBucket = Math.floor(now / step) * step;

  // Compute time window — output is always exactly `limit` buckets
  let windowEnd: number;
  let windowStart: number;

  if (fromParam && toParam) {
    windowStart = Math.floor(parseInt(fromParam, 10) / step) * step;
    windowEnd = Math.floor(parseInt(toParam, 10) / step) * step;
    // If range exceeds limit, keep the most recent buckets
    const maxStart = windowEnd - (limit - 1) * step;
    if (windowStart < maxStart) windowStart = maxStart;
  } else if (fromParam) {
    windowStart = Math.floor(parseInt(fromParam, 10) / step) * step;
    windowEnd = Math.min(windowStart + (limit - 1) * step, nowBucket);
  } else if (toParam) {
    windowEnd = Math.floor(parseInt(toParam, 10) / step) * step;
    windowStart = windowEnd - (limit - 1) * step;
  } else {
    // Default: last `limit` buckets up to now
    windowEnd = nowBucket;
    windowStart = nowBucket - (limit - 1) * step;
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
  const candles = buildGrid(realCandles, seedClose, windowStart, windowEnd, step);

  return Response.json(
    { pair, interval, candles },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
