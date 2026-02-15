import { updatePairStats } from "./stats";
import { getMode, setMode } from "./state";

export const INTERVAL_SECONDS: Record<string, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1m": 2592000, // 30 days
  "1y": 31536000, // 365 days
};

export const ALL_INTERVALS = Object.keys(INTERVAL_SECONDS);

export function bucketTimestamp(
  unixSeconds: number,
  interval: string
): number {
  const size = INTERVAL_SECONDS[interval];
  if (!size) throw new Error(`Unknown interval: ${interval}`);
  return Math.floor(unixSeconds / size) * size;
}

export async function aggregateCandlesForPair(
  db: D1Database,
  pair: string,
  sinceTime: number
): Promise<void> {
  for (const interval of ALL_INTERVALS) {
    const startBucket = bucketTimestamp(sinceTime, interval);

    // Get all trades for this pair from the affected time range.
    // Secondary sort by rowid ensures deterministic open/close when
    // multiple trades share the same block_time.
    const trades = await db
      .prepare(
        `SELECT block_time, price, amount, volume, side
         FROM trades
         WHERE pair = ? AND block_time >= ?
         ORDER BY block_time ASC, rowid ASC`
      )
      .bind(pair, startBucket)
      .all<{
        block_time: number;
        price: number;
        amount: number;
        volume: number;
        side: string;
      }>();

    if (!trades.results.length) continue;

    // Group trades by bucket
    const buckets = new Map<
      number,
      {
        prices: { time: number; price: number }[];
        volume: number;
        buyVolume: number;
        sellVolume: number;
        count: number;
      }
    >();

    for (const trade of trades.results) {
      const bucket = bucketTimestamp(trade.block_time, interval);
      let entry = buckets.get(bucket);
      if (!entry) {
        entry = {
          prices: [],
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          count: 0,
        };
        buckets.set(bucket, entry);
      }
      entry.prices.push({ time: trade.block_time, price: trade.price });
      entry.volume += trade.volume;
      if (trade.side === "buy") entry.buyVolume += trade.volume;
      else entry.sellVolume += trade.volume;
      entry.count++;
    }

    // Batch upsert candles (50 at a time to stay within D1 limits)
    const stmts: D1PreparedStatement[] = [];
    for (const [timestamp, data] of buckets) {
      data.prices.sort((a, b) => a.time - b.time);
      const open = parseFloat(data.prices[0].price.toFixed(8));
      const close = parseFloat(data.prices[data.prices.length - 1].price.toFixed(8));
      const high = parseFloat(Math.max(...data.prices.map((p) => p.price)).toFixed(8));
      const low = parseFloat(Math.min(...data.prices.map((p) => p.price)).toFixed(8));

      stmts.push(
        db
          .prepare(
            `INSERT INTO candles (pair, interval, timestamp, open, high, low, close, volume, buy_volume, sell_volume, trades)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (pair, interval, timestamp)
             DO UPDATE SET open = excluded.open, high = excluded.high, low = excluded.low,
                           close = excluded.close, volume = excluded.volume,
                           buy_volume = excluded.buy_volume, sell_volume = excluded.sell_volume,
                           trades = excluded.trades`
          )
          .bind(
            pair,
            interval,
            timestamp,
            open,
            high,
            low,
            close,
            data.volume,
            data.buyVolume,
            data.sellVolume,
            data.count
          )
      );
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }
  }
}

/**
 * Catch-up aggregation: processes a batch of pairs that haven't been aggregated yet.
 * Called by the cron handler when `aggregation_offset` exists in indexer_state.
 * Returns true when all pairs are done.
 */
const CATCHUP_BATCH_SIZE = 200;

export async function runCatchupAggregation(
  db: D1Database
): Promise<{ done: boolean; processed: number; offset: number }> {
  const row = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'aggregation_offset'`)
    .first<{ value: string }>();

  if (!row) return { done: true, processed: 0, offset: 0 };

  const offset = parseInt(row.value, 10);
  const pairs = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, first_trade_time
       FROM pair_stats
       ORDER BY pair LIMIT ? OFFSET ?`
    )
    .bind(CATCHUP_BATCH_SIZE, offset)
    .all<{
      pair: string;
      base_asset: string;
      quote_asset: string;
      first_trade_time: number | null;
    }>();

  if (!pairs.results.length) {
    // All pairs processed — clean up
    await db
      .prepare(`DELETE FROM indexer_state WHERE key = 'aggregation_offset'`)
      .run();

    // If we were in BUILD_AGGREGATES, transition to FOLLOWING
    const mode = await getMode(db);
    if (mode === "BUILD_AGGREGATES") {
      await setMode(db, "FOLLOWING");
    }

    return { done: true, processed: 0, offset };
  }

  for (const p of pairs.results) {
    const earliest = p.first_trade_time ?? 0;
    await aggregateCandlesForPair(db, p.pair, earliest);
    await updatePairStats(db, p.pair, p.base_asset, p.quote_asset);
  }

  const nextOffset = offset + pairs.results.length;
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('aggregation_offset', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(String(nextOffset))
    .run();

  return { done: false, processed: pairs.results.length, offset };
}
