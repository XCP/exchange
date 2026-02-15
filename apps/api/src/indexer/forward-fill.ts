import { ALL_INTERVALS, bucketTimestamp } from "./aggregate";

const INTERVAL_SECONDS: Record<string, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1m": 2592000,
};

export async function forwardFillCandles(
  db: D1Database,
  pair: string,
  interval: string,
  now: number
): Promise<void> {
  const bucketSize = INTERVAL_SECONDS[interval];
  if (!bucketSize) return;

  // Get the last real candle (with trades > 0)
  const lastReal = await db
    .prepare(
      `SELECT timestamp, close FROM candles
       WHERE pair = ? AND interval = ? AND trades > 0
       ORDER BY timestamp DESC LIMIT 1`
    )
    .bind(pair, interval)
    .first<{ timestamp: number; close: number }>();

  if (!lastReal) return;

  const nowBucket = bucketTimestamp(now, interval);
  let ts = lastReal.timestamp + bucketSize;

  // Fill up to current bucket (inclusive)
  const stmts: D1PreparedStatement[] = [];
  while (ts <= nowBucket) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO candles (pair, interval, timestamp, open, high, low, close, volume, buy_volume, sell_volume, trades)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
           ON CONFLICT (pair, interval, timestamp) DO NOTHING`
        )
        .bind(
          pair,
          interval,
          ts,
          lastReal.close,
          lastReal.close,
          lastReal.close,
          lastReal.close
        )
    );
    ts += bucketSize;
  }

  // Batch in groups of 50 to stay within D1 limits
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}
