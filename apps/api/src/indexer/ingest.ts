import { fetchOrderMatches } from "../lib/counterparty";
import { normalizeOrderMatch, NormalizedTrade } from "./normalize";
import { aggregateCandlesForPair } from "./aggregate";
import { updatePairStats } from "./stats";

const BATCH_SIZE = 200;
const DEFAULT_MAX_PAGES = 1000;

export async function runIndexer(
  db: D1Database,
  apiBase: string,
  maxPages: number = DEFAULT_MAX_PAGES,
  skipAggregation: boolean = false
): Promise<{ inserted: number; pages: number; done: boolean }> {
  // Read sync state
  const cursorRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'last_cursor'`)
    .first<{ value: string }>();
  let cursor = cursorRow?.value || null;

  let totalInserted = 0;
  let pages = 0;
  const affectedPairs = new Map<string, { base: string; quote: string; earliestTime: number }>();

  while (pages < maxPages) {
    const { matches, nextCursor } = await fetchOrderMatches(
      apiBase,
      cursor,
      BATCH_SIZE
    );

    if (matches.length === 0) break;

    const trades: NormalizedTrade[] = [];
    for (const match of matches) {
      try {
        trades.push(normalizeOrderMatch(match));
      } catch (e) {
        console.error(`Failed to normalize match ${match.id}:`, e);
      }
    }

    // Batch insert trades (skip duplicates via IGNORE)
    if (trades.length > 0) {
      const stmts = trades.map((t) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO trades
             (match_id, pair, base_asset, quote_asset, block_index, block_time,
              price, amount, volume, side, maker, taker, tx0_hash, tx1_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            t.match_id,
            t.pair,
            t.base_asset,
            t.quote_asset,
            t.block_index,
            t.block_time,
            t.price,
            t.amount,
            t.volume,
            t.side,
            t.maker,
            t.taker,
            t.tx0_hash,
            t.tx1_hash
          )
      );

      // D1 batch limit ~100 statements
      for (let i = 0; i < stmts.length; i += 50) {
        const results = await db.batch(stmts.slice(i, i + 50));
        for (const r of results) {
          if (r.meta.changes > 0) totalInserted++;
        }
      }

      // Track affected pairs for candle rebuild
      for (const t of trades) {
        const existing = affectedPairs.get(t.pair);
        if (!existing || t.block_time < existing.earliestTime) {
          affectedPairs.set(t.pair, {
            base: t.base_asset,
            quote: t.quote_asset,
            earliestTime: t.block_time,
          });
        }
      }
    }

    cursor = nextCursor;
    pages++;

    // Save cursor after each page (only if we have a valid next cursor)
    if (cursor) {
      await db
        .prepare(
          `INSERT INTO indexer_state (key, value) VALUES ('last_cursor', ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`
        )
        .bind(cursor)
        .run();
    } else {
      // Reached the end — clear cursor so next run starts fresh for new data
      await db
        .prepare(`DELETE FROM indexer_state WHERE key = 'last_cursor'`)
        .run();
      break;
    }
  }

  // Rebuild candles and stats for affected pairs (skip during backfill)
  if (!skipAggregation) {
    for (const [pair, info] of affectedPairs) {
      await aggregateCandlesForPair(db, pair, info.earliestTime);
      await updatePairStats(db, pair, info.base, info.quote);
    }
  } else if (totalInserted > 0) {
    // Flag that we need catch-up aggregation (cron will handle it)
    await db
      .prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('aggregation_offset', '0')
         ON CONFLICT (key) DO NOTHING`
      )
      .run();
  }

  // Save run time
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('last_run_time', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(String(Math.floor(Date.now() / 1000)))
    .run();

  return { inserted: totalInserted, pages, done: !cursor };
}
