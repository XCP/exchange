import { ALL_INTERVALS, calendarBucket } from "../lib/constants";
import { D1_BATCH_LIMIT, batchExec } from "../lib/batch";
import { bulkUpdatePairStats } from "./stats";
import { bulkUpdateDispenserStats } from "./dispenser-stats";
import { getMode } from "./state";

const CATCHUP_BATCH_SIZE = 200;

export function bucketTimestamp(
  unixSeconds: number,
  interval: string
): number {
  return calendarBucket(unixSeconds, interval);
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
      const bucket = calendarBucket(t.block_time, interval);
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
        const bucket = calendarBucket(t.block_time, interval);
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

// Bulk stats: 6 queries per 95-pair chunk → ~750 queries for 7000 pairs
const STATS_BATCH_SIZE = 7000;

/**
 * Catch-up stats: bulk-compute rolling-window pair stats for many pairs.
 * Uses set-based SQL (GROUP BY + JSON UPDATE) instead of per-pair queries.
 * 6 D1 queries per chunk of 95 pairs ≈ 450 queries for 7000 pairs.
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
    // Pair stats done — seed dispenser stats cursor for next phase
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'stats_cursor'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('dispenser_stats_cursor', '')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
    return { done: true, processed: 0, cursor };
  }

  await bulkUpdatePairStats(db, pairs.results);

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

// Bulk dispenser stats: 7 queries per 95-asset chunk → ~525 queries for 7000 assets
const DISPENSER_STATS_BATCH_SIZE = 7000;

/**
 * Catch-up dispenser stats: bulk-compute all-time metrics for many assets.
 * Uses set-based SQL (GROUP BY + JSON UPDATE) instead of per-asset queries.
 * 7 D1 queries per chunk of 95 assets ≈ 525 queries for 7000 assets.
 */
export async function runCatchupDispenserStats(
  db: D1Database
): Promise<{ done: boolean; processed: number; cursor: string }> {
  const cursorRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'dispenser_stats_cursor'`)
    .first<{ value: string }>();

  if (!cursorRow) return { done: true, processed: 0, cursor: "" };

  const cursor = cursorRow.value;
  const assets = await db
    .prepare(
      `SELECT asset FROM dispenser_stats
       WHERE asset > ?
       ORDER BY asset LIMIT ?`
    )
    .bind(cursor, DISPENSER_STATS_BATCH_SIZE)
    .all<{ asset: string }>();

  if (!assets.results.length) {
    // All assets done — transition to FOLLOWING
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'dispenser_stats_cursor'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'FOLLOWING')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
    return { done: true, processed: 0, cursor };
  }

  await bulkUpdateDispenserStats(db, assets.results.map((a) => a.asset));

  const lastAsset = assets.results[assets.results.length - 1].asset;
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('dispenser_stats_cursor', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(lastAsset)
    .run();

  return { done: false, processed: assets.results.length, cursor: lastAsset };
}

