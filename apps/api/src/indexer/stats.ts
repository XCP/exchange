import { batchExec } from "../lib/batch";

/** Max items per SQL chunk — constrained by D1's 100 bound params per statement */
const BULK_CHUNK = 95;

/**
 * Bulk-update pair_stats for many pairs at once using set-based SQL.
 * Uses 7 queries per chunk of 95 pairs (6 reads batched + 1 JSON write)
 * instead of 7 queries per individual pair — ~100x fewer D1 queries.
 */
export async function bulkUpdatePairStats(
  db: D1Database,
  pairRows: { pair: string; base_asset: string; quote_asset: string }[]
): Promise<void> {
  if (pairRows.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t7d = now - 604800;
  const t30d = now - 2592000;

  for (let ci = 0; ci < pairRows.length; ci += BULK_CHUNK) {
    const chunk = pairRows.slice(ci, ci + BULK_CHUNK);
    const pairs = chunk.map((p) => p.pair);
    const n = pairs.length;
    const phFrom = (start: number) =>
      pairs.map((_, i) => `?${start + i}`).join(",");

    // Batch 6 read queries in one round trip
    const [statsRes, lastTradeRes, p24Res, p7Res, p30Res, tradersRes] = await db.batch([
      // Q1: Windowed + all-time stats (?1=t24h, ?2=t7d, ?3=t30d, ?4..=pairs)
      db
        .prepare(
          `SELECT pair,
            SUM(volume) as total_vol, SUM(amount) as total_base_vol,
            COUNT(*) as total_cnt,
            MAX(price) as ath, MIN(price) as atl,
            COALESCE(SUM(CASE WHEN block_time >= ?1 THEN volume END), 0) as vol_24h,
            COALESCE(SUM(CASE WHEN block_time >= ?2 THEN volume END), 0) as vol_7d,
            COALESCE(SUM(CASE WHEN block_time >= ?3 THEN volume END), 0) as vol_30d,
            COALESCE(SUM(CASE WHEN block_time >= ?1 THEN amount END), 0) as bvol_24h,
            COALESCE(SUM(CASE WHEN block_time >= ?2 THEN amount END), 0) as bvol_7d,
            COALESCE(SUM(CASE WHEN block_time >= ?3 THEN amount END), 0) as bvol_30d,
            SUM(CASE WHEN block_time >= ?1 THEN 1 ELSE 0 END) as cnt_24h,
            SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_7d,
            SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_30d,
            MAX(CASE WHEN block_time >= ?1 THEN price END) as hi_24h,
            MIN(CASE WHEN block_time >= ?1 THEN price END) as lo_24h,
            MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_7d,
            MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_7d,
            MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_30d,
            MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_30d
          FROM trades WHERE pair IN (${phFrom(4)})
          GROUP BY pair`
        )
        .bind(t24h, t7d, t30d, ...pairs),

      // Q2: Last trade + first trade time (window functions)
      db
        .prepare(
          `SELECT pair, last_price, last_trade_time, last_side, first_trade_time
          FROM (
            SELECT pair, price as last_price, block_time as last_trade_time,
              side as last_side,
              MIN(block_time) OVER (PARTITION BY pair) as first_trade_time,
              ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC, rowid DESC) as rn
            FROM trades WHERE pair IN (${phFrom(1)})
          ) WHERE rn = 1`
        )
        .bind(...pairs),

      // Q3: Price 24h ago
      db
        .prepare(
          `SELECT pair, price as price_ago FROM (
            SELECT pair, price,
              ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
            FROM trades WHERE pair IN (${phFrom(1)}) AND block_time <= ?${n + 1}
          ) WHERE rn = 1`
        )
        .bind(...pairs, t24h),

      // Q4: Price 7d ago
      db
        .prepare(
          `SELECT pair, price as price_ago FROM (
            SELECT pair, price,
              ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
            FROM trades WHERE pair IN (${phFrom(1)}) AND block_time <= ?${n + 1}
          ) WHERE rn = 1`
        )
        .bind(...pairs, t7d),

      // Q5: Price 30d ago
      db
        .prepare(
          `SELECT pair, price as price_ago FROM (
            SELECT pair, price,
              ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
            FROM trades WHERE pair IN (${phFrom(1)}) AND block_time <= ?${n + 1}
          ) WHERE rn = 1`
        )
        .bind(...pairs, t30d),

      // Q6: Unique traders per pair (UNION deduplicates maker/taker)
      // Both subqueries reuse the same positional params to stay within D1's 100-param limit
      db
        .prepare(
          `SELECT pair, COUNT(DISTINCT addr) as unique_traders FROM (
             SELECT pair, maker as addr FROM trades WHERE pair IN (${phFrom(1)})
             UNION
             SELECT pair, taker FROM trades WHERE pair IN (${phFrom(1)})
           ) GROUP BY pair`
        )
        .bind(...pairs),
    ]);

    // Build lookup maps
    type AnyRow = Record<string, any>;
    const toMap = (res: D1Result) => {
      const m = new Map<string, AnyRow>();
      for (const r of res.results as AnyRow[]) m.set(r.pair, r);
      return m;
    };
    const statsMap = toMap(statsRes);
    const ltMap = toMap(lastTradeRes);
    const p24Map = toMap(p24Res);
    const p7Map = toMap(p7Res);
    const p30Map = toMap(p30Res);
    const tradersMap = toMap(tradersRes);

    // Compute price changes and build JSON for bulk write
    const updates = chunk.map((row) => {
      const s = statsMap.get(row.pair);
      const lt = ltMap.get(row.pair);
      const tr = tradersMap.get(row.pair);
      const p24 = p24Map.get(row.pair);
      const p7 = p7Map.get(row.pair);
      const p30 = p30Map.get(row.pair);

      const lp = lt?.last_price ?? null;
      const pa24 = p24?.price_ago ?? 0;
      const pa7 = p7?.price_ago ?? 0;
      const pa30 = p30?.price_ago ?? 0;
      const pc24 = lp && pa24 > 0 ? ((lp - pa24) / pa24) * 100 : 0;
      const pc7 = lp && pa7 > 0 ? ((lp - pa7) / pa7) * 100 : 0;
      const pc30 = lp && pa30 > 0 ? ((lp - pa30) / pa30) * 100 : 0;

      return {
        p: row.pair,
        lp,
        lt: lt?.last_trade_time ?? null,
        ls: lt?.last_side ?? null,
        ft: lt?.first_trade_time ?? null,
        pc24, pc7, pc30,
        v24: s?.vol_24h ?? 0, v7: s?.vol_7d ?? 0, v30: s?.vol_30d ?? 0,
        bv24: s?.bvol_24h ?? 0, bv7: s?.bvol_7d ?? 0, bv30: s?.bvol_30d ?? 0,
        h24: s?.hi_24h ?? null, l24: s?.lo_24h ?? null,
        h7: s?.hi_7d ?? null, l7: s?.lo_7d ?? null,
        h30: s?.hi_30d ?? null, l30: s?.lo_30d ?? null,
        c24: s?.cnt_24h ?? 0, c7: s?.cnt_7d ?? 0, c30: s?.cnt_30d ?? 0,
        tv: s?.total_vol ?? 0, tbv: s?.total_base_vol ?? 0, tc: s?.total_cnt ?? 0,
        ut: tr?.unique_traders ?? 0,
        ath: s?.ath ?? null, atl: s?.atl ?? null,
        ua: now,
      };
    });

    // Single JSON UPDATE...FROM — 1 query for all pairs in the chunk
    await db
      .prepare(
        `UPDATE pair_stats SET
          last_price = json_extract(j.value, '$.lp'),
          last_trade_time = json_extract(j.value, '$.lt'),
          last_side = json_extract(j.value, '$.ls'),
          first_trade_time = json_extract(j.value, '$.ft'),
          price_change_24h = json_extract(j.value, '$.pc24'),
          price_change_7d = json_extract(j.value, '$.pc7'),
          price_change_30d = json_extract(j.value, '$.pc30'),
          volume_24h = json_extract(j.value, '$.v24'),
          volume_7d = json_extract(j.value, '$.v7'),
          volume_30d = json_extract(j.value, '$.v30'),
          base_volume_24h = json_extract(j.value, '$.bv24'),
          base_volume_7d = json_extract(j.value, '$.bv7'),
          base_volume_30d = json_extract(j.value, '$.bv30'),
          high_24h = json_extract(j.value, '$.h24'),
          low_24h = json_extract(j.value, '$.l24'),
          high_7d = json_extract(j.value, '$.h7'),
          low_7d = json_extract(j.value, '$.l7'),
          high_30d = json_extract(j.value, '$.h30'),
          low_30d = json_extract(j.value, '$.l30'),
          trade_count_24h = json_extract(j.value, '$.c24'),
          trade_count_7d = json_extract(j.value, '$.c7'),
          trade_count_30d = json_extract(j.value, '$.c30'),
          total_volume = json_extract(j.value, '$.tv'),
          total_base_volume = json_extract(j.value, '$.tbv'),
          total_trade_count = json_extract(j.value, '$.tc'),
          unique_traders = json_extract(j.value, '$.ut'),
          all_time_high = json_extract(j.value, '$.ath'),
          all_time_low = json_extract(j.value, '$.atl'),
          updated_at = json_extract(j.value, '$.ua')
        FROM json_each(?) AS j
        WHERE pair_stats.pair = json_extract(j.value, '$.p')`
      )
      .bind(JSON.stringify(updates))
      .run();

    // Backfill NULL longnames from the assets table
    await db
      .prepare(
        `UPDATE pair_stats SET
          base_asset_longname = COALESCE(pair_stats.base_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.base_asset)),
          quote_asset_longname = COALESCE(pair_stats.quote_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.quote_asset))
        WHERE pair IN (${phFrom(1)})
          AND (base_asset_longname IS NULL OR quote_asset_longname IS NULL)`
      )
      .bind(...pairs)
      .run();
  }
}

export async function updatePairStats(
  db: D1Database,
  pair: string,
  baseAsset: string,
  quoteAsset: string,
  baseLongname?: string | null,
  quoteLongname?: string | null
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t7d = now - 604800;
  const t30d = now - 2592000;

  // Single query for latest, first, and windowed stats
  const stats = await db
    .prepare(
      `SELECT
        (SELECT price FROM trades WHERE pair = ?1 ORDER BY block_time DESC LIMIT 1) as last_price,
        (SELECT block_time FROM trades WHERE pair = ?1 ORDER BY block_time DESC LIMIT 1) as last_trade_time,
        (SELECT side FROM trades WHERE pair = ?1 ORDER BY block_time DESC LIMIT 1) as last_side,
        (SELECT block_time FROM trades WHERE pair = ?1 ORDER BY block_time ASC LIMIT 1) as first_trade_time,
        COALESCE(SUM(CASE WHEN block_time >= ?2 THEN volume ELSE 0 END), 0) as vol_24h,
        COALESCE(SUM(CASE WHEN block_time >= ?3 THEN volume ELSE 0 END), 0) as vol_7d,
        COALESCE(SUM(CASE WHEN block_time >= ?4 THEN volume ELSE 0 END), 0) as vol_30d,
        COALESCE(SUM(CASE WHEN block_time >= ?2 THEN amount ELSE 0 END), 0) as bvol_24h,
        COALESCE(SUM(CASE WHEN block_time >= ?3 THEN amount ELSE 0 END), 0) as bvol_7d,
        COALESCE(SUM(CASE WHEN block_time >= ?4 THEN amount ELSE 0 END), 0) as bvol_30d,
        SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_24h,
        SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_7d,
        SUM(CASE WHEN block_time >= ?4 THEN 1 ELSE 0 END) as cnt_30d,
        MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_24h,
        MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_24h,
        MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_7d,
        MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_7d,
        MAX(CASE WHEN block_time >= ?4 THEN price END) as hi_30d,
        MIN(CASE WHEN block_time >= ?4 THEN price END) as lo_30d
       FROM trades WHERE pair = ?1 AND block_time >= ?4`
    )
    .bind(pair, t24h, t7d, t30d)
    .first<{
      last_price: number | null;
      last_trade_time: number | null;
      last_side: string | null;
      first_trade_time: number | null;
      vol_24h: number;
      vol_7d: number;
      vol_30d: number;
      bvol_24h: number;
      bvol_7d: number;
      bvol_30d: number;
      cnt_24h: number;
      cnt_7d: number;
      cnt_30d: number;
      hi_24h: number | null;
      lo_24h: number | null;
      hi_7d: number | null;
      lo_7d: number | null;
      hi_30d: number | null;
      lo_30d: number | null;
    }>();

  // Price change lookups + all-time totals (run in parallel)
  const [price24hAgo, price7dAgo, price30dAgo, allTime, traderCount] = await Promise.all([
    db
      .prepare(
        `SELECT price FROM trades
         WHERE pair = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(pair, t24h)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT price FROM trades
         WHERE pair = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(pair, t7d)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT price FROM trades
         WHERE pair = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(pair, t30d)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(volume), 0) as total_volume,
                COALESCE(SUM(amount), 0) as total_base_volume,
                COUNT(*) as total_count,
                MAX(price) as ath,
                MIN(price) as atl
         FROM trades WHERE pair = ?`
      )
      .bind(pair)
      .first<{ total_volume: number; total_base_volume: number; total_count: number; ath: number | null; atl: number | null }>(),
    // UNION deduplicates addresses that appear as both maker and taker
    db
      .prepare(
        `SELECT COUNT(*) as unique_traders FROM (
           SELECT maker as addr FROM trades WHERE pair = ?
           UNION
           SELECT taker FROM trades WHERE pair = ?
         )`
      )
      .bind(pair, pair)
      .first<{ unique_traders: number }>(),
  ]);

  const lastPrice = stats?.last_price ?? null;
  const priceChange24h =
    lastPrice && price24hAgo && price24hAgo.price > 0
      ? ((lastPrice - price24hAgo.price) / price24hAgo.price) * 100
      : 0;
  const priceChange7d =
    lastPrice && price7dAgo && price7dAgo.price > 0
      ? ((lastPrice - price7dAgo.price) / price7dAgo.price) * 100
      : 0;
  const priceChange30d =
    lastPrice && price30dAgo && price30dAgo.price > 0
      ? ((lastPrice - price30dAgo.price) / price30dAgo.price) * 100
      : 0;

  await db
    .prepare(
      `INSERT INTO pair_stats (pair, base_asset, quote_asset, base_asset_longname, quote_asset_longname, last_price, last_trade_time, last_side,
         price_change_24h, price_change_7d, price_change_30d,
         volume_24h, volume_7d, volume_30d,
         base_volume_24h, base_volume_7d, base_volume_30d,
         high_24h, low_24h, high_7d, low_7d, high_30d, low_30d,
         trade_count_24h, trade_count_7d, trade_count_30d,
         first_trade_time,
         total_volume, total_base_volume, total_trade_count, unique_traders, all_time_high, all_time_low,
         updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (pair) DO UPDATE SET
         base_asset_longname = COALESCE(pair_stats.base_asset_longname, excluded.base_asset_longname),
         quote_asset_longname = COALESCE(pair_stats.quote_asset_longname, excluded.quote_asset_longname),
         last_price = excluded.last_price,
         last_trade_time = excluded.last_trade_time,
         last_side = excluded.last_side,
         price_change_24h = excluded.price_change_24h,
         price_change_7d = excluded.price_change_7d,
         price_change_30d = excluded.price_change_30d,
         volume_24h = excluded.volume_24h,
         volume_7d = excluded.volume_7d,
         volume_30d = excluded.volume_30d,
         base_volume_24h = excluded.base_volume_24h,
         base_volume_7d = excluded.base_volume_7d,
         base_volume_30d = excluded.base_volume_30d,
         high_24h = excluded.high_24h,
         low_24h = excluded.low_24h,
         high_7d = excluded.high_7d,
         low_7d = excluded.low_7d,
         high_30d = excluded.high_30d,
         low_30d = excluded.low_30d,
         trade_count_24h = excluded.trade_count_24h,
         trade_count_7d = excluded.trade_count_7d,
         trade_count_30d = excluded.trade_count_30d,
         first_trade_time = excluded.first_trade_time,
         total_volume = excluded.total_volume,
         total_base_volume = excluded.total_base_volume,
         total_trade_count = excluded.total_trade_count,
         unique_traders = excluded.unique_traders,
         all_time_high = excluded.all_time_high,
         all_time_low = excluded.all_time_low,
         updated_at = excluded.updated_at`
    )
    .bind(
      pair,
      baseAsset,
      quoteAsset,
      baseLongname ?? null,
      quoteLongname ?? null,
      lastPrice,
      stats?.last_trade_time ?? null,
      stats?.last_side ?? null,
      priceChange24h,
      priceChange7d,
      priceChange30d,
      stats?.vol_24h ?? 0,
      stats?.vol_7d ?? 0,
      stats?.vol_30d ?? 0,
      stats?.bvol_24h ?? 0,
      stats?.bvol_7d ?? 0,
      stats?.bvol_30d ?? 0,
      stats?.hi_24h ?? null,
      stats?.lo_24h ?? null,
      stats?.hi_7d ?? null,
      stats?.lo_7d ?? null,
      stats?.hi_30d ?? null,
      stats?.lo_30d ?? null,
      stats?.cnt_24h ?? 0,
      stats?.cnt_7d ?? 0,
      stats?.cnt_30d ?? 0,
      stats?.first_trade_time ?? null,
      allTime?.total_volume ?? 0,
      allTime?.total_base_volume ?? 0,
      allTime?.total_count ?? 0,
      traderCount?.unique_traders ?? 0,
      allTime?.ath ?? null,
      allTime?.atl ?? null,
      now
    )
    .run();
}

/**
 * Close orders that have expired (expire_index <= current chain tip).
 * These should be caught by ORDER_EXPIRATION events during block sync,
 * but this acts as a safety net for any missed events.
 */
export async function closeExpiredOrders(
  db: D1Database,
  now: number
): Promise<number> {
  const lastBlockRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'last_block_index'`)
    .first<{ value: string }>();
  if (!lastBlockRow) return 0;

  const lastBlock = parseInt(lastBlockRow.value, 10);
  const result = await db
    .prepare(
      `UPDATE orders SET status = 'expired', closed_at = ?
       WHERE status = 'open' AND expire_index <= ?`
    )
    .bind(now, lastBlock)
    .run();

  return result.meta.changes ?? 0;
}

/**
 * Update pair_stats with order book metrics (bid/ask counts, best prices, spread).
 * First closes any expired orders, then recalculates for pairs with open orders.
 */
export async function updateOrderBookStats(
  db: D1Database,
  now: number
): Promise<void> {
  // Close expired orders before computing stats
  const expired = await closeExpiredOrders(db, now);
  if (expired > 0) {
    console.log(`Closed ${expired} expired orders`);
  }

  const pairsWithOrders = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset,
              COUNT(*) as open_orders,
              SUM(CASE WHEN side = 'bid' THEN 1 ELSE 0 END) as bid_count,
              SUM(CASE WHEN side = 'ask' THEN 1 ELSE 0 END) as ask_count,
              MAX(CASE WHEN side = 'bid' THEN price END) as best_bid,
              MIN(CASE WHEN side = 'ask' THEN price END) as best_ask
       FROM orders WHERE status = 'open'
       GROUP BY pair`
    )
    .all<{
      pair: string;
      base_asset: string;
      quote_asset: string;
      open_orders: number;
      bid_count: number;
      ask_count: number;
      best_bid: number | null;
      best_ask: number | null;
    }>();

  const stmts = pairsWithOrders.results.map((p) => {
    const spread =
      p.best_bid && p.best_ask
        ? Math.max(0, ((p.best_ask - p.best_bid) / p.best_ask) * 100)
        : null;

    return db
      .prepare(
        `INSERT INTO pair_stats (pair, base_asset, quote_asset, open_orders, bid_count, ask_count, best_bid, best_ask, spread, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (pair) DO UPDATE SET
           open_orders = excluded.open_orders,
           bid_count = excluded.bid_count,
           ask_count = excluded.ask_count,
           best_bid = excluded.best_bid,
           best_ask = excluded.best_ask,
           spread = excluded.spread,
           updated_at = excluded.updated_at`
      )
      .bind(
        p.pair, p.base_asset, p.quote_asset,
        p.open_orders, p.bid_count, p.ask_count,
        p.best_bid, p.best_ask, spread, now
      );
  });

  await batchExec(db, stmts);

  // Backfill NULL longnames from the assets table for any newly-created rows
  await db
    .prepare(
      `UPDATE pair_stats SET
        base_asset_longname = COALESCE(pair_stats.base_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.base_asset)),
        quote_asset_longname = COALESCE(pair_stats.quote_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.quote_asset))
      WHERE base_asset_longname IS NULL OR quote_asset_longname IS NULL`
    )
    .run();

  // Zero out stats for pairs that no longer have open orders
  await db
    .prepare(
      `UPDATE pair_stats SET open_orders = 0, bid_count = 0, ask_count = 0,
       best_bid = NULL, best_ask = NULL, spread = NULL
       WHERE open_orders > 0 AND NOT EXISTS (
         SELECT 1 FROM orders WHERE orders.pair = pair_stats.pair AND orders.status = 'open'
       )`
    )
    .run();
}

/**
 * Refresh stale rolling-window stats for pairs that had recent activity
 * but haven't traded in a while. Without this, volume_24h / trade_count_24h /
 * volume_7d / volume_30d etc. remain frozen at their last-computed values.
 * Checks all three time windows (24h, 7d, 30d).
 */
export async function refreshStalePairStats(
  db: D1Database
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t7d = now - 604800;
  const t30d = now - 2592000;

  // Refresh all pairs that had any trade in the last 30 days or have
  // non-zero rolling stats — ensures updated_at stays current
  const stalePairs = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset FROM pair_stats
       WHERE last_trade_time IS NOT NULL AND (
         last_trade_time >= ?1
         OR trade_count_24h > 0 OR volume_24h > 0
         OR trade_count_7d > 0 OR volume_7d > 0
         OR trade_count_30d > 0 OR volume_30d > 0
       )`
    )
    .bind(t30d)
    .all<{ pair: string; base_asset: string; quote_asset: string }>();

  if (stalePairs.results.length > 0) {
    await bulkUpdatePairStats(db, stalePairs.results);
  }

  return stalePairs.results.length;
}

/**
 * Resolve missing base_asset_longname values in pair_stats by querying the
 * Counterparty API directly. Processes a small batch per call to stay within
 * rate limits and CPU budget. Only targets numeric assets (A\d+) which are
 * subassets that should have longnames.
 */
export async function backfillMissingLongnames(
  db: D1Database,
  batchSize: number = 10
): Promise<number> {
  const missing = await db
    .prepare(
      `SELECT DISTINCT base_asset FROM pair_stats
       WHERE base_asset_longname IS NULL AND base_asset LIKE 'A%'
       LIMIT ?`
    )
    .bind(batchSize)
    .all<{ base_asset: string }>();

  if (missing.results.length === 0) return 0;

  let updated = 0;
  for (const row of missing.results) {
    try {
      const resp = await fetch(
        `https://api.counterparty.io:4000/v2/assets/${row.base_asset}`,
        { headers: { Accept: "application/json" } }
      );
      if (!resp.ok) continue;
      const data = (await resp.json()) as { result?: { asset_longname?: string | null } };
      const longname = data.result?.asset_longname;
      if (!longname) continue;

      await db.batch([
        db.prepare(
          `UPDATE pair_stats SET base_asset_longname = ? WHERE base_asset = ? AND base_asset_longname IS NULL`
        ).bind(longname, row.base_asset),
        db.prepare(
          `INSERT INTO assets (asset, asset_longname, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (asset) DO UPDATE SET asset_longname = COALESCE(assets.asset_longname, excluded.asset_longname), updated_at = excluded.updated_at`
        ).bind(row.base_asset, longname, Math.floor(Date.now() / 1000)),
      ]);
      updated++;
    } catch {
      // Skip failures — will retry next cron tick
    }
  }

  return updated;
}
