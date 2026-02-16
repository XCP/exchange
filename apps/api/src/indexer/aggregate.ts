import { INTERVAL_SECONDS, ALL_INTERVALS } from "../lib/constants";
import { D1_BATCH_LIMIT, batchExec } from "../lib/batch";
import { updatePairStats } from "./stats";
import { getMode } from "./state";

const CATCHUP_BATCH_SIZE = 200;

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
  // Use the smallest bucket (1y) to fetch trades once for all intervals
  const startBucket = bucketTimestamp(sinceTime, "1y");

  const trades = await db
    .prepare(
      `SELECT block_time, price, volume, side
       FROM trades
       WHERE pair = ? AND block_time >= ?
       ORDER BY block_time ASC, rowid ASC`
    )
    .bind(pair, startBucket)
    .all<{
      block_time: number;
      price: number;
      volume: number;
      side: string;
    }>();

  if (!trades.results.length) return;

  // Build candles for each interval from the same trade data
  for (const interval of ALL_INTERVALS) {
    const step = INTERVAL_SECONDS[interval];
    const intervalStart = bucketTimestamp(sinceTime, interval);

    const buckets = new Map<
      number,
      {
        open: number;
        close: number;
        high: number;
        low: number;
        volume: number;
        buyVolume: number;
        sellVolume: number;
        count: number;
      }
    >();

    for (const t of trades.results) {
      if (t.block_time < intervalStart) continue;
      const bucket = Math.floor(t.block_time / step) * step;
      let entry = buckets.get(bucket);
      if (!entry) {
        entry = {
          open: t.price,
          close: t.price,
          high: t.price,
          low: t.price,
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          count: 0,
        };
        buckets.set(bucket, entry);
      }
      entry.close = t.price;
      if (t.price > entry.high) entry.high = t.price;
      if (t.price < entry.low) entry.low = t.price;
      entry.volume += t.volume;
      if (t.side === "buy") entry.buyVolume += t.volume;
      else entry.sellVolume += t.volume;
      entry.count++;
    }

    const stmts: D1PreparedStatement[] = [];
    for (const [timestamp, data] of buckets) {
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
            Math.round(data.open * 1e8) / 1e8,
            Math.round(data.high * 1e8) / 1e8,
            Math.round(data.low * 1e8) / 1e8,
            Math.round(data.close * 1e8) / 1e8,
            data.volume,
            data.buyVolume,
            data.sellVolume,
            data.count
          )
      );
    }

    await batchExec(db, stmts);
  }
}

/**
 * Bulk candle aggregation: fetches trades for a chunk of pairs in one query,
 * computes OHLC in JS, batch-inserts candles. Processes pairs in chunks to
 * stay within D1's SQL variable limit.
 */

async function bulkAggregateCandlesForPairs(
  db: D1Database,
  pairs: string[]
): Promise<void> {
  if (pairs.length === 0) return;

  for (let i = 0; i < pairs.length; i += D1_BATCH_LIMIT) {
    const chunk = pairs.slice(i, i + D1_BATCH_LIMIT);
    const placeholders = chunk.map(() => "?").join(",");

    // One query: all trades for this chunk, sorted for deterministic open/close
    const trades = await db
      .prepare(
        `SELECT pair, block_time, price, volume, side
         FROM trades
         WHERE pair IN (${placeholders})
         ORDER BY pair, block_time ASC, rowid ASC`
      )
      .bind(...chunk)
      .all<{
        pair: string;
        block_time: number;
        price: number;
        volume: number;
        side: string;
      }>();

    if (!trades.results.length) continue;

    // Build candles for every interval from the same trade data
    for (const interval of ALL_INTERVALS) {
      const step = INTERVAL_SECONDS[interval];

      // Group by pair + bucket
      const buckets = new Map<
        string,
        {
          pair: string;
          bucket: number;
          open: number;
          close: number;
          high: number;
          low: number;
          volume: number;
          buyVolume: number;
          sellVolume: number;
          count: number;
        }
      >();

      for (const t of trades.results) {
        const bucket = Math.floor(t.block_time / step) * step;
        const key = `${t.pair}|${bucket}`;
        let entry = buckets.get(key);
        if (!entry) {
          entry = {
            pair: t.pair,
            bucket,
            open: t.price,
            close: t.price,
            high: t.price,
            low: t.price,
            volume: 0,
            buyVolume: 0,
            sellVolume: 0,
            count: 0,
          };
          buckets.set(key, entry);
        }
        // Trades are sorted ASC — first hit sets open, every hit updates close
        entry.close = t.price;
        if (t.price > entry.high) entry.high = t.price;
        if (t.price < entry.low) entry.low = t.price;
        entry.volume += t.volume;
        if (t.side === "buy") entry.buyVolume += t.volume;
        else entry.sellVolume += t.volume;
        entry.count++;
      }

      // Batch upsert candles (50 at a time for D1 limits)
      const stmts: D1PreparedStatement[] = [];
      for (const data of buckets.values()) {
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
              data.pair,
              interval,
              data.bucket,
              Math.round(data.open * 1e8) / 1e8,
              Math.round(data.high * 1e8) / 1e8,
              Math.round(data.low * 1e8) / 1e8,
              Math.round(data.close * 1e8) / 1e8,
              data.volume,
              data.buyVolume,
              data.sellVolume,
              data.count
            )
        );
      }

      await batchExec(db, stmts);
    }
  }
}

/**
 * Catch-up aggregation: processes a batch of pairs that haven't been aggregated yet.
 * Uses bulk SQL for candles — 6 queries per batch instead of 6 per pair.
 */
export async function runCatchupAggregation(
  db: D1Database
): Promise<{ done: boolean; processed: number; cursor: string }> {
  // Use keyset pagination (pair > cursor) instead of OFFSET for O(log n) performance
  const cursorRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'aggregation_cursor'`)
    .first<{ value: string }>();

  if (!cursorRow) return { done: true, processed: 0, cursor: "" };

  const cursor = cursorRow.value;
  const pairs = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, first_trade_time
       FROM pair_stats
       WHERE pair > ?
       ORDER BY pair LIMIT ?`
    )
    .bind(cursor, CATCHUP_BATCH_SIZE)
    .all<{
      pair: string;
      base_asset: string;
      quote_asset: string;
      first_trade_time: number | null;
    }>();

  if (!pairs.results.length) {
    // All pairs processed — clean up and transition
    const mode = await getMode(db);
    const nextMode = mode === "BUILD_AGGREGATES" ? "REFRESH_STATS" : "FOLLOWING";
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'aggregation_cursor'`),
      ...(mode === "BUILD_AGGREGATES"
        ? [
            db.prepare(
              `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', ?)
               ON CONFLICT (key) DO UPDATE SET value = excluded.value`
            ).bind(nextMode),
            // Seed stats cursor at empty string so runCatchupStats starts from the beginning
            db.prepare(
              `INSERT INTO indexer_state (key, value) VALUES ('stats_cursor', '')
               ON CONFLICT (key) DO UPDATE SET value = excluded.value`
            ),
          ]
        : []),
    ]);

    return { done: true, processed: 0, cursor };
  }

  // Bulk candle aggregation (skip stats during catchup — they'll be
  // computed once we transition to FOLLOWING mode, saving ~250 D1
  // queries per batch)
  const pairNames = pairs.results.map((p) => p.pair);
  await bulkAggregateCandlesForPairs(db, pairNames);

  const lastPair = pairs.results[pairs.results.length - 1].pair;
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('aggregation_cursor', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(lastPair)
    .run();

  return { done: false, processed: pairs.results.length, cursor };
}

const STATS_BATCH_SIZE = 50;

/**
 * Catch-up stats: compute rolling-window pair stats for all pairs.
 * Runs after BUILD_AGGREGATES to populate 24h/7d/30d volume, price
 * changes, etc. before entering FOLLOWING mode.
 * Each pair costs 5 D1 queries, so 50 pairs = ~253 queries per batch.
 */
export async function runCatchupStats(
  db: D1Database
): Promise<{ done: boolean; processed: number; cursor: string }> {
  const cursorRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'stats_cursor'`)
    .first<{ value: string }>();

  if (!cursorRow) return { done: true, processed: 0, cursor: "" };

  const cursor = cursorRow.value;
  const pairs = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset
       FROM pair_stats
       WHERE pair > ?
       ORDER BY pair LIMIT ?`
    )
    .bind(cursor, STATS_BATCH_SIZE)
    .all<{ pair: string; base_asset: string; quote_asset: string }>();

  if (!pairs.results.length) {
    // All pairs done — transition to FOLLOWING
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'stats_cursor'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'FOLLOWING')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
    return { done: true, processed: 0, cursor };
  }

  for (const p of pairs.results) {
    await updatePairStats(db, p.pair, p.base_asset, p.quote_asset);
  }

  const lastPair = pairs.results[pairs.results.length - 1].pair;
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('stats_cursor', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(lastPair)
    .run();

  return { done: false, processed: pairs.results.length, cursor: lastPair };
}
