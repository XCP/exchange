import { batchExec } from "../lib/batch";

/** Max items per SQL chunk - constrained by D1's 100 bound params per statement */
const BULK_CHUNK = 95;

/**
 * Bulk-update pair_stats for many pairs at once using set-based SQL.
 * Uses 7 queries per chunk of 95 pairs (6 reads batched + 1 JSON write)
 * instead of 7 queries per individual pair - ~100x fewer D1 queries.
 */
export async function bulkUpdatePairStats(
  db: D1Database,
  pairRows: { pair: string; base_asset: string; quote_asset: string }[]
): Promise<void> {
  if (pairRows.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t30d = now - 2592000;
  const t1y = now - 31536000;

  for (let ci = 0; ci < pairRows.length; ci += BULK_CHUNK) {
    const chunk = pairRows.slice(ci, ci + BULK_CHUNK);
    const pairs = chunk.map((p) => p.pair);
    const n = pairs.length;
    const phFrom = (start: number) =>
      pairs.map((_, i) => `?${start + i}`).join(",");

    // Batch 6 read queries in one round trip
    const [statsRes, lastTradeRes, p24Res, p30Res, p1yRes, selfRes, tradersRes] = await db.batch([
      // Q1: Windowed + all-time stats (?1=t24h, ?2=t30d, ?3=t1y, ?4..=pairs)
      db
        .prepare(
          `SELECT pair,
            SUM(volume) as total_vol, SUM(amount) as total_base_vol,
            COUNT(*) as total_cnt,
            MAX(price) as ath, MIN(price) as atl,
            COALESCE(SUM(CASE WHEN block_time >= ?1 THEN volume END), 0) as vol_24h,
            COALESCE(SUM(CASE WHEN block_time >= ?2 THEN volume END), 0) as vol_30d,
            COALESCE(SUM(CASE WHEN block_time >= ?3 THEN volume END), 0) as vol_1y,
            COALESCE(SUM(CASE WHEN block_time >= ?1 THEN amount END), 0) as bvol_24h,
            COALESCE(SUM(CASE WHEN block_time >= ?2 THEN amount END), 0) as bvol_30d,
            COALESCE(SUM(CASE WHEN block_time >= ?3 THEN amount END), 0) as bvol_1y,
            SUM(CASE WHEN block_time >= ?1 THEN 1 ELSE 0 END) as cnt_24h,
            SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_30d,
            SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_1y,
            MAX(CASE WHEN block_time >= ?1 THEN price END) as hi_24h,
            MIN(CASE WHEN block_time >= ?1 THEN price END) as lo_24h,
            MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_30d,
            MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_30d,
            MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_1y,
            MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_1y
          FROM trades WHERE pair IN (${phFrom(4)})
          GROUP BY pair`
        )
        .bind(t24h, t30d, t1y, ...pairs),

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

      // Q4: Price 30d ago
      db
        .prepare(
          `SELECT pair, price as price_ago FROM (
            SELECT pair, price,
              ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
            FROM trades WHERE pair IN (${phFrom(1)}) AND block_time <= ?${n + 1}
          ) WHERE rn = 1`
        )
        .bind(...pairs, t30d),

      // Q5: Price 1y ago
      db
        .prepare(
          `SELECT pair, price as price_ago FROM (
            SELECT pair, price,
              ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
            FROM trades WHERE pair IN (${phFrom(1)}) AND block_time <= ?${n + 1}
          ) WHERE rn = 1`
        )
        .bind(...pairs, t1y),

      // Q7: Self-trade share per pair — the fraction of matches with the same
      // address on both sides, which manufactures volume and price without
      // moving value. Computed here because these are the same trade rows Q6
      // is already reading.
      //
      // BOOK TRADES ONLY. An AMM swap's counterparty is the pool, which has no
      // address, so the indexer writes the trader into BOTH maker and taker and
      // every pool swap reads as a wash trade. Measured 2026-08-25 across the
      // whole table: order-book trades are 3.2% self (194,028 rows), pool
      // trades are 100.0% (259 rows) — every pool swap ever recorded, without
      // exception. Dividing by COUNT(*) therefore reported a market's POOL
      // SHARE and called it wash trading.
      //
      // COALESCE to 0 rather than NULL: a pair with no book trades has no
      // evidence of self-dealing, and absence of evidence must not read as an
      // unknown that downstream tests then treat as suspicious.
      db
        .prepare(
          `SELECT pair,
                  COALESCE(
                    SUM(CASE WHEN source_type <> 'pool' AND maker = taker THEN 1.0 ELSE 0 END) * 100.0
                      / NULLIF(SUM(CASE WHEN source_type <> 'pool' THEN 1 ELSE 0 END), 0),
                    0
                  ) AS self_trade_pct
           FROM trades WHERE pair IN (${phFrom(1)}) GROUP BY pair`
        )
        .bind(...pairs),

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
    const p30Map = toMap(p30Res);
    const p1yMap = toMap(p1yRes);
    const selfMap = toMap(selfRes);
    const tradersMap = toMap(tradersRes);

    // Compute price changes and build JSON for bulk write
    const updates = chunk.map((row) => {
      const s = statsMap.get(row.pair);
      const lt = ltMap.get(row.pair);
      const tr = tradersMap.get(row.pair);
      const self = selfMap.get(row.pair);
      const p24 = p24Map.get(row.pair);
      const p30 = p30Map.get(row.pair);
      const p1y = p1yMap.get(row.pair);

      const lp = lt?.last_price ?? null;
      const pa24 = p24?.price_ago ?? 0;
      const pa30 = p30?.price_ago ?? 0;
      const pa1y = p1y?.price_ago ?? 0;
      const pc24 = lp && pa24 > 0 ? ((lp - pa24) / pa24) * 100 : 0;
      const pc30 = lp && pa30 > 0 ? ((lp - pa30) / pa30) * 100 : 0;
      const pc1y = lp && pa1y > 0 ? ((lp - pa1y) / pa1y) * 100 : 0;

      return {
        p: row.pair,
        lp,
        lt: lt?.last_trade_time ?? null,
        ls: lt?.last_side ?? null,
        ft: lt?.first_trade_time ?? null,
        pc24, pc30, pc1y,
        v24: s?.vol_24h ?? 0, v30: s?.vol_30d ?? 0, v1y: s?.vol_1y ?? 0,
        bv24: s?.bvol_24h ?? 0, bv30: s?.bvol_30d ?? 0, bv1y: s?.bvol_1y ?? 0,
        h24: s?.hi_24h ?? null, l24: s?.lo_24h ?? null,
        h30: s?.hi_30d ?? null, l30: s?.lo_30d ?? null,
        h1y: s?.hi_1y ?? null, l1y: s?.lo_1y ?? null,
        c24: s?.cnt_24h ?? 0, c30: s?.cnt_30d ?? 0, c1y: s?.cnt_1y ?? 0,
        tv: s?.total_vol ?? 0, tbv: s?.total_base_vol ?? 0, tc: s?.total_cnt ?? 0,
        ut: tr?.unique_traders ?? 0,
        stp: self?.self_trade_pct ?? 0,
        ath: s?.ath ?? null, atl: s?.atl ?? null,
        ua: now,
      };
    });

    // Single JSON UPDATE...FROM - 1 query for all pairs in the chunk
    await db
      .prepare(
        `UPDATE pair_stats SET
          last_price = json_extract(j.value, '$.lp'),
          last_trade_time = json_extract(j.value, '$.lt'),
          last_side = json_extract(j.value, '$.ls'),
          first_trade_time = json_extract(j.value, '$.ft'),
          price_change_24h = json_extract(j.value, '$.pc24'),
          price_change_30d = json_extract(j.value, '$.pc30'),
          price_change_1y = json_extract(j.value, '$.pc1y'),
          volume_24h = json_extract(j.value, '$.v24'),
          volume_30d = json_extract(j.value, '$.v30'),
          volume_1y = json_extract(j.value, '$.v1y'),
          base_volume_24h = json_extract(j.value, '$.bv24'),
          base_volume_30d = json_extract(j.value, '$.bv30'),
          base_volume_1y = json_extract(j.value, '$.bv1y'),
          high_24h = json_extract(j.value, '$.h24'),
          low_24h = json_extract(j.value, '$.l24'),
          high_30d = json_extract(j.value, '$.h30'),
          low_30d = json_extract(j.value, '$.l30'),
          high_1y = json_extract(j.value, '$.h1y'),
          low_1y = json_extract(j.value, '$.l1y'),
          trade_count_24h = json_extract(j.value, '$.c24'),
          trade_count_30d = json_extract(j.value, '$.c30'),
          trade_count_1y = json_extract(j.value, '$.c1y'),
          total_volume = json_extract(j.value, '$.tv'),
          total_base_volume = json_extract(j.value, '$.tbv'),
          total_trade_count = json_extract(j.value, '$.tc'),
          unique_traders = json_extract(j.value, '$.ut'),
          self_trade_pct = json_extract(j.value, '$.stp'),
          -- hidden is NOT derived here any more. It is carried forward
          -- untouched, so manual flags and the asset-level rule in
          -- low-quality.ts survive, and nothing is ever un-hidden by accident.
          --
          -- This used to auto-hide on self_trade_pct >= 50 AND tc >= 30. The
          -- ratio was wrong (it counted every AMM swap as a wash trade — see
          -- Q7), but the rule was also carrying no weight even in principle.
          -- Measured 2026-08-25: of 199 hidden pairs, 196 are explained by a
          -- low-quality asset on one leg. The remaining 3 were hidden by this
          -- rule alone, and all 3 were false positives — CAPTAINDAN_XCP,
          -- PEPEMEMECOIN_XCP and STOLEYERGIRL_XCP, whose real book self-trade
          -- rate is 0.0%. Zero true positives in the whole table, against three
          -- launchpad graduates hidden from /explore/pools, analytics, the
          -- DefiLlama feed and deal scores at the moment they started working.
          --
          -- Asset quality is judged where the evidence lives: xcp.io rates the
          -- ASSET and low-quality.ts propagates that to both legs. A pair-level
          -- threshold on top of it was a second opinion with worse data.
          hidden = pair_stats.hidden,
          all_time_high = json_extract(j.value, '$.ath'),
          all_time_low = json_extract(j.value, '$.atl'),
          updated_at = json_extract(j.value, '$.ua')
        FROM json_each(?) AS j
        WHERE pair_stats.pair = json_extract(j.value, '$.p')`
      )
      .bind(JSON.stringify(updates))
      .run();

    // Backfill NULL longnames from the assets table. Same guard as the
    // unscoped copy below: test that a longname is AVAILABLE, not just that the
    // column is null, or every plain asset in the batch is rewritten with the
    // NULL it already held on every refresh.
    await db
      .prepare(
        `UPDATE pair_stats SET
          base_asset_longname = COALESCE(pair_stats.base_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.base_asset)),
          quote_asset_longname = COALESCE(pair_stats.quote_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.quote_asset))
        WHERE pair IN (${phFrom(1)})
          AND ((pair_stats.base_asset_longname IS NULL
                AND (SELECT asset_longname FROM assets WHERE asset = pair_stats.base_asset) IS NOT NULL)
            OR (pair_stats.quote_asset_longname IS NULL
                AND (SELECT asset_longname FROM assets WHERE asset = pair_stats.quote_asset) IS NOT NULL))`
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
  const t30d = now - 2592000;
  const t1y = now - 31536000;

  // Single query for latest, first, and windowed stats
  const stats = await db
    .prepare(
      `SELECT
        (SELECT price FROM trades WHERE pair = ?1 ORDER BY block_time DESC LIMIT 1) as last_price,
        (SELECT block_time FROM trades WHERE pair = ?1 ORDER BY block_time DESC LIMIT 1) as last_trade_time,
        (SELECT side FROM trades WHERE pair = ?1 ORDER BY block_time DESC LIMIT 1) as last_side,
        (SELECT block_time FROM trades WHERE pair = ?1 ORDER BY block_time ASC LIMIT 1) as first_trade_time,
        COALESCE(SUM(CASE WHEN block_time >= ?2 THEN volume ELSE 0 END), 0) as vol_24h,
        COALESCE(SUM(CASE WHEN block_time >= ?3 THEN volume ELSE 0 END), 0) as vol_30d,
        COALESCE(SUM(CASE WHEN block_time >= ?4 THEN volume ELSE 0 END), 0) as vol_1y,
        COALESCE(SUM(CASE WHEN block_time >= ?2 THEN amount ELSE 0 END), 0) as bvol_24h,
        COALESCE(SUM(CASE WHEN block_time >= ?3 THEN amount ELSE 0 END), 0) as bvol_30d,
        COALESCE(SUM(CASE WHEN block_time >= ?4 THEN amount ELSE 0 END), 0) as bvol_1y,
        SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_24h,
        SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_30d,
        SUM(CASE WHEN block_time >= ?4 THEN 1 ELSE 0 END) as cnt_1y,
        MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_24h,
        MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_24h,
        MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_30d,
        MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_30d,
        MAX(CASE WHEN block_time >= ?4 THEN price END) as hi_1y,
        MIN(CASE WHEN block_time >= ?4 THEN price END) as lo_1y
       FROM trades WHERE pair = ?1 AND block_time >= ?4`
    )
    .bind(pair, t24h, t30d, t1y)
    .first<{
      last_price: number | null;
      last_trade_time: number | null;
      last_side: string | null;
      first_trade_time: number | null;
      vol_24h: number;
      vol_30d: number;
      vol_1y: number;
      bvol_24h: number;
      bvol_30d: number;
      bvol_1y: number;
      cnt_24h: number;
      cnt_30d: number;
      cnt_1y: number;
      hi_24h: number | null;
      lo_24h: number | null;
      hi_30d: number | null;
      lo_30d: number | null;
      hi_1y: number | null;
      lo_1y: number | null;
    }>();

  // Price change lookups + all-time totals (run in parallel)
  const [price24hAgo, price30dAgo, price1yAgo, allTime, traderCount] = await Promise.all([
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
      .bind(pair, t30d)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT price FROM trades
         WHERE pair = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(pair, t1y)
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
  const priceChange30d =
    lastPrice && price30dAgo && price30dAgo.price > 0
      ? ((lastPrice - price30dAgo.price) / price30dAgo.price) * 100
      : 0;
  const priceChange1y =
    lastPrice && price1yAgo && price1yAgo.price > 0
      ? ((lastPrice - price1yAgo.price) / price1yAgo.price) * 100
      : 0;

  await db
    .prepare(
      `INSERT INTO pair_stats (pair, base_asset, quote_asset, base_asset_longname, quote_asset_longname, last_price, last_trade_time, last_side,
         price_change_24h, price_change_30d, price_change_1y,
         volume_24h, volume_30d, volume_1y,
         base_volume_24h, base_volume_30d, base_volume_1y,
         high_24h, low_24h, high_30d, low_30d, high_1y, low_1y,
         trade_count_24h, trade_count_30d, trade_count_1y,
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
         price_change_30d = excluded.price_change_30d,
         price_change_1y = excluded.price_change_1y,
         volume_24h = excluded.volume_24h,
         volume_30d = excluded.volume_30d,
         volume_1y = excluded.volume_1y,
         base_volume_24h = excluded.base_volume_24h,
         base_volume_30d = excluded.base_volume_30d,
         base_volume_1y = excluded.base_volume_1y,
         high_24h = excluded.high_24h,
         low_24h = excluded.low_24h,
         high_30d = excluded.high_30d,
         low_30d = excluded.low_30d,
         high_1y = excluded.high_1y,
         low_1y = excluded.low_1y,
         trade_count_24h = excluded.trade_count_24h,
         trade_count_30d = excluded.trade_count_30d,
         trade_count_1y = excluded.trade_count_1y,
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
      priceChange30d,
      priceChange1y,
      stats?.vol_24h ?? 0,
      stats?.vol_30d ?? 0,
      stats?.vol_1y ?? 0,
      stats?.bvol_24h ?? 0,
      stats?.bvol_30d ?? 0,
      stats?.bvol_1y ?? 0,
      stats?.hi_24h ?? null,
      stats?.lo_24h ?? null,
      stats?.hi_30d ?? null,
      stats?.lo_30d ?? null,
      stats?.hi_1y ?? null,
      stats?.lo_1y ?? null,
      stats?.cnt_24h ?? 0,
      stats?.cnt_30d ?? 0,
      stats?.cnt_1y ?? 0,
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
       WHERE status = 'open' AND expire_index IS NOT NULL AND expire_index <= ?`
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
           updated_at = excluded.updated_at
         WHERE pair_stats.open_orders IS NOT excluded.open_orders
            OR pair_stats.bid_count   IS NOT excluded.bid_count
            OR pair_stats.ask_count   IS NOT excluded.ask_count
            OR pair_stats.best_bid    IS NOT excluded.best_bid
            OR pair_stats.best_ask    IS NOT excluded.best_ask
            OR pair_stats.spread      IS NOT excluded.spread`
      )
      .bind(
        p.pair, p.base_asset, p.quote_asset,
        p.open_orders, p.bid_count, p.ask_count,
        p.best_bid, p.best_ask, spread, now
      );
  });
  // NOTE ON THE GUARD ABOVE. `updated_at` is deliberately NOT part of the
  // comparison: it changes on every run by definition, so including it would
  // make the guard never fire. That redefines the column from "last checked"
  // to "last changed", which is the more useful meaning and is safe here --
  // nothing selects or sorts pair_stats rows by it (refreshStalePairStats uses
  // last_trade_time, and the web app never displays it).
  //
  // Measured before the guard: 78,765 runs a day writing exactly 1.0 rows
  // each, because an unguarded upsert rewrites the row whether or not the
  // order book moved. Most pairs have no open orders and nothing to change.
  // D1 bills a written row ~1000x a read one, so this is worth the six
  // comparisons.

  await batchExec(db, stmts);

  // Backfill NULL longnames from the assets table for any newly-created rows.
  //
  // The WHERE tests that a longname is actually AVAILABLE, not merely that the
  // column is null. Only subassets have longnames, so for ~12,400 plain assets
  // the lookup returns NULL too and `COALESCE(NULL, NULL)` wrote NULL over
  // NULL -- a no-op that D1 still bills, on a row that then matched again on
  // the next tick, forever.
  //
  // Measured before this guard: 12,393 rows matched the old WHERE and 0 of
  // them could change. 138 runs/day x 12,393 = 1,710,096 rows written every
  // day to alter nothing -- effectively the entire account's D1 write line, at
  // ~$1.00 per million written rows.
  //
  // Rows read are ~1000x cheaper than rows written, which is exactly why this
  // hid: it never looked expensive in a rows-read ranking.
  await db
    .prepare(
      `UPDATE pair_stats SET
        base_asset_longname = COALESCE(pair_stats.base_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.base_asset)),
        quote_asset_longname = COALESCE(pair_stats.quote_asset_longname, (SELECT asset_longname FROM assets WHERE asset = pair_stats.quote_asset))
      WHERE (pair_stats.base_asset_longname IS NULL
             AND (SELECT asset_longname FROM assets WHERE asset = pair_stats.base_asset) IS NOT NULL)
         OR (pair_stats.quote_asset_longname IS NULL
             AND (SELECT asset_longname FROM assets WHERE asset = pair_stats.quote_asset) IS NOT NULL)`
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
 * volume_30d etc. remain frozen at their last-computed values.
 * Covers the short windows (24h, 30d); the year window is swept separately
 * by refreshLongWindowPairStats.
 */
export async function refreshStalePairStats(
  db: D1Database
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const t30d = now - 2592000;

  // Refresh all pairs that had any trade in the last 30 days or have
  // non-zero rolling stats - ensures updated_at stays current
  const stalePairs = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset FROM pair_stats
       WHERE last_trade_time IS NOT NULL AND (
         last_trade_time >= ?1
         OR trade_count_24h > 0 OR volume_24h > 0
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
 * Sweep the year window. A pair that last traded months ago still has a
 * volume_1y that only changes when those trades age past the boundary, so the
 * hourly short-window sweep would rewrite it every hour for nothing. This runs
 * daily instead - a day of drift on a 365-day window is noise, and the pair set
 * is an order of magnitude larger than the 30-day one.
 *
 * Selects on last_trade_time rather than volume_1y so the sweep still reaches
 * rows whose year columns were never populated (a pair that fell quiet before
 * the 7d -> 1y rename carried a 7-day value, often zero, into volume_1y). The
 * trade_count_1y / volume_1y arms catch pairs whose last trade has itself aged
 * out of the window, which is exactly when the stored total must drop to zero.
 */
export async function refreshLongWindowPairStats(
  db: D1Database
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const t1y = now - 31536000;

  const pairs = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset FROM pair_stats
       WHERE last_trade_time IS NOT NULL AND (
         last_trade_time >= ?1
         OR trade_count_1y > 0 OR volume_1y > 0
       )`
    )
    .bind(t1y)
    .all<{ pair: string; base_asset: string; quote_asset: string }>();

  if (pairs.results.length > 0) {
    await bulkUpdatePairStats(db, pairs.results);
  }

  return pairs.results.length;
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
      // Skip failures - will retry next cron tick
    }
  }

  return updated;
}
