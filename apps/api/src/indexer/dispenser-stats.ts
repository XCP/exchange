import { batchExec } from "../lib/batch";

/** Max items per SQL chunk — constrained by D1's 100 bound params per statement */
const BULK_CHUNK = 95;

/**
 * Bulk-update dispenser_stats for many assets at once using set-based SQL.
 * Uses 7 queries per chunk of 95 assets (6 reads batched + 1 JSON write)
 * instead of 7 queries per individual asset.
 */
export async function bulkUpdateDispenserStats(
  db: D1Database,
  assets: string[]
): Promise<void> {
  if (assets.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t30d = now - 2592000;
  const t1y = now - 31536000;

  for (let ci = 0; ci < assets.length; ci += BULK_CHUNK) {
    const chunk = assets.slice(ci, ci + BULK_CHUNK);
    const n = chunk.length;
    const phFrom = (start: number) =>
      chunk.map((_, i) => `?${start + i}`).join(",");

    // Batch 6 read queries in one round trip
    const [statsRes, lastRes, p24Res, p30Res, p1yRes, dispenserRes] =
      await db.batch([
        // Q1: Windowed + all-time stats from dispenses (?1=t24h, ?2=t30d, ?3=t1y)
        db
          .prepare(
            `SELECT asset,
              COALESCE(SUM(btc_amount), 0) as total_btc,
              COALESCE(SUM(dispense_quantity), 0) as total_qty,
              COUNT(*) as total_cnt,
              COUNT(DISTINCT destination) as unique_buyers,
              COALESCE(SUM(CASE WHEN block_time >= ?1 THEN btc_amount END), 0) as vol_24h,
              COALESCE(SUM(CASE WHEN block_time >= ?2 THEN btc_amount END), 0) as vol_30d,
              COALESCE(SUM(CASE WHEN block_time >= ?3 THEN btc_amount END), 0) as vol_1y,
              SUM(CASE WHEN block_time >= ?1 THEN 1 ELSE 0 END) as cnt_24h,
              SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_30d,
              SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_1y,
              MAX(CASE WHEN block_time >= ?1 THEN price END) as hi_24h,
              MIN(CASE WHEN block_time >= ?1 THEN price END) as lo_24h,
              MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_30d,
              MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_30d,
              MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_1y,
              MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_1y
            FROM dispenses WHERE asset IN (${phFrom(4)})
            GROUP BY asset`
          )
          .bind(t24h, t30d, t1y, ...chunk),

        // Q2: Last/first dispense info
        db
          .prepare(
            `SELECT asset, last_price, last_time, first_time FROM (
              SELECT asset, price as last_price, block_time as last_time,
                MIN(block_time) OVER (PARTITION BY asset) as first_time,
                ROW_NUMBER() OVER (PARTITION BY asset ORDER BY block_time DESC, rowid DESC) as rn
              FROM dispenses WHERE asset IN (${phFrom(1)})
            ) WHERE rn = 1`
          )
          .bind(...chunk),

        // Q3: Price 24h ago
        db
          .prepare(
            `SELECT asset, price as price_ago FROM (
              SELECT asset, price,
                ROW_NUMBER() OVER (PARTITION BY asset ORDER BY block_time DESC) as rn
              FROM dispenses WHERE asset IN (${phFrom(1)}) AND block_time <= ?${n + 1}
            ) WHERE rn = 1`
          )
          .bind(...chunk, t24h),

        // Q4: Price 30d ago
        db
          .prepare(
            `SELECT asset, price as price_ago FROM (
              SELECT asset, price,
                ROW_NUMBER() OVER (PARTITION BY asset ORDER BY block_time DESC) as rn
              FROM dispenses WHERE asset IN (${phFrom(1)}) AND block_time <= ?${n + 1}
            ) WHERE rn = 1`
          )
          .bind(...chunk, t30d),

        // Q5: Price 1y ago
        db
          .prepare(
            `SELECT asset, price as price_ago FROM (
              SELECT asset, price,
                ROW_NUMBER() OVER (PARTITION BY asset ORDER BY block_time DESC) as rn
              FROM dispenses WHERE asset IN (${phFrom(1)}) AND block_time <= ?${n + 1}
            ) WHERE rn = 1`
          )
          .bind(...chunk, t1y),

        // Q6: Dispenser counts from dispensers table
        db
          .prepare(
            `SELECT asset,
              COUNT(*) as total_created,
              COUNT(DISTINCT source) as unique_sellers
            FROM dispensers WHERE asset IN (${phFrom(1)})
            GROUP BY asset`
          )
          .bind(...chunk),
      ]);

    // Build lookup maps
    type AnyRow = Record<string, any>;
    const toMap = (res: D1Result) => {
      const m = new Map<string, AnyRow>();
      for (const r of res.results as AnyRow[]) m.set(r.asset, r);
      return m;
    };
    const statsMap = toMap(statsRes);
    const ltMap = toMap(lastRes);
    const p24Map = toMap(p24Res);
    const p30Map = toMap(p30Res);
    const p1yMap = toMap(p1yRes);
    const dispMap = toMap(dispenserRes);

    // Compute price changes and build JSON
    const updates = chunk.map((asset) => {
      const s = statsMap.get(asset);
      const lt = ltMap.get(asset);
      const p24 = p24Map.get(asset);
      const p30 = p30Map.get(asset);
      const p1y = p1yMap.get(asset);
      const d = dispMap.get(asset);

      const lp = lt?.last_price ?? null;
      const pa24 = p24?.price_ago ?? 0;
      const pa30 = p30?.price_ago ?? 0;
      const pa1y = p1y?.price_ago ?? 0;
      const pc24 = lp && pa24 > 0 ? ((lp - pa24) / pa24) * 100 : 0;
      const pc30 = lp && pa30 > 0 ? ((lp - pa30) / pa30) * 100 : 0;
      const pc1y = lp && pa1y > 0 ? ((lp - pa1y) / pa1y) * 100 : 0;

      const totalBtc = s?.total_btc ?? 0;
      const totalCnt = s?.total_cnt ?? 0;

      return {
        a: asset,
        lp,
        lt: lt?.last_time ?? null,
        ft: lt?.first_time ?? null,
        pc24, pc30, pc1y,
        v24: s?.vol_24h ?? 0, v30: s?.vol_30d ?? 0, v1y: s?.vol_1y ?? 0,
        h24: s?.hi_24h ?? null, l24: s?.lo_24h ?? null,
        h30: s?.hi_30d ?? null, l30: s?.lo_30d ?? null,
        h1y: s?.hi_1y ?? null, l1y: s?.lo_1y ?? null,
        c24: s?.cnt_24h ?? 0, c30: s?.cnt_30d ?? 0, c1y: s?.cnt_1y ?? 0,
        tb: totalBtc,
        td: s?.total_qty ?? 0,
        tc: totalCnt,
        ub: s?.unique_buyers ?? 0,
        us: d?.unique_sellers ?? 0,
        dc: d?.total_created ?? 0,
        ab: totalCnt > 0 ? totalBtc / totalCnt : 0,
        ua: now,
      };
    });

    // Single JSON UPDATE...FROM — 1 query for all assets in the chunk
    await db
      .prepare(
        `UPDATE dispenser_stats SET
          last_dispense_price = json_extract(j.value, '$.lp'),
          last_dispense_time = json_extract(j.value, '$.lt'),
          first_dispense_time = json_extract(j.value, '$.ft'),
          price_change_24h = json_extract(j.value, '$.pc24'),
          price_change_30d = json_extract(j.value, '$.pc30'),
          price_change_1y = json_extract(j.value, '$.pc1y'),
          volume_24h = json_extract(j.value, '$.v24'),
          volume_30d = json_extract(j.value, '$.v30'),
          volume_1y = json_extract(j.value, '$.v1y'),
          high_24h = json_extract(j.value, '$.h24'),
          low_24h = json_extract(j.value, '$.l24'),
          high_30d = json_extract(j.value, '$.h30'),
          low_30d = json_extract(j.value, '$.l30'),
          high_1y = json_extract(j.value, '$.h1y'),
          low_1y = json_extract(j.value, '$.l1y'),
          dispense_count_24h = json_extract(j.value, '$.c24'),
          dispense_count_30d = json_extract(j.value, '$.c30'),
          dispense_count_1y = json_extract(j.value, '$.c1y'),
          total_btc_spent = json_extract(j.value, '$.tb'),
          total_dispensed = json_extract(j.value, '$.td'),
          total_dispense_count = json_extract(j.value, '$.tc'),
          unique_buyers = json_extract(j.value, '$.ub'),
          unique_sellers = json_extract(j.value, '$.us'),
          total_dispensers_created = json_extract(j.value, '$.dc'),
          avg_dispense_btc = json_extract(j.value, '$.ab'),
          updated_at = json_extract(j.value, '$.ua')
        FROM json_each(?) AS j
        WHERE dispenser_stats.asset = json_extract(j.value, '$.a')`
      )
      .bind(JSON.stringify(updates))
      .run();
  }
}

/**
 * Aggregate active dispenser counts into dispenser_stats (used by snapshot sync).
 */
export async function upsertDispenserAggregates(
  db: D1Database,
  now: number
): Promise<void> {
  const assetAggs = await db
    .prepare(
      `SELECT asset,
              COUNT(*) as active_dispensers,
              COALESCE(SUM(give_remaining), 0) as total_available,
              MIN(CASE WHEN price > 0 THEN price END) as cheapest_price
       FROM dispensers WHERE status < 10
       GROUP BY asset`
    )
    .all<{
      asset: string;
      active_dispensers: number;
      total_available: number;
      cheapest_price: number | null;
    }>();

  const stmts = assetAggs.results.map((a) =>
    db
      .prepare(
        `INSERT INTO dispenser_stats (asset, active_dispensers, total_available, cheapest_price, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (asset) DO UPDATE SET
           active_dispensers = excluded.active_dispensers,
           total_available = excluded.total_available,
           cheapest_price = excluded.cheapest_price,
           updated_at = excluded.updated_at`
      )
      .bind(a.asset, a.active_dispensers, a.total_available, a.cheapest_price, now)
  );

  await batchExec(db, stmts);

  // Zero out stats for assets that no longer have open dispensers
  await db
    .prepare(
      `UPDATE dispenser_stats SET active_dispensers = 0, total_available = 0, cheapest_price = NULL
       WHERE active_dispensers > 0 AND NOT EXISTS (
         SELECT 1 FROM dispensers WHERE dispensers.asset = dispenser_stats.asset AND dispensers.status < 10
       )`
    )
    .run();
}

export async function updateDispenserStats(
  db: D1Database,
  asset: string,
  assetLongname?: string | null
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t30d = now - 2592000;
  const t1y = now - 31536000;

  // Single consolidated query for latest, first, and windowed stats
  const stats = await db
    .prepare(
      `SELECT
        (SELECT price FROM dispenses WHERE asset = ?1 ORDER BY block_time DESC LIMIT 1) as last_price,
        (SELECT block_time FROM dispenses WHERE asset = ?1 ORDER BY block_time DESC LIMIT 1) as last_time,
        (SELECT block_time FROM dispenses WHERE asset = ?1 ORDER BY block_time ASC LIMIT 1) as first_time,
        COALESCE(SUM(CASE WHEN block_time >= ?2 THEN btc_amount ELSE 0 END), 0) as vol_24h,
        COALESCE(SUM(CASE WHEN block_time >= ?3 THEN btc_amount ELSE 0 END), 0) as vol_30d,
        COALESCE(SUM(CASE WHEN block_time >= ?4 THEN btc_amount ELSE 0 END), 0) as vol_1y,
        SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_24h,
        SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_30d,
        SUM(CASE WHEN block_time >= ?4 THEN 1 ELSE 0 END) as cnt_1y,
        MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_24h,
        MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_24h,
        MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_30d,
        MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_30d,
        MAX(CASE WHEN block_time >= ?4 THEN price END) as hi_1y,
        MIN(CASE WHEN block_time >= ?4 THEN price END) as lo_1y
       FROM dispenses WHERE asset = ?1 AND block_time >= ?4`
    )
    .bind(asset, t24h, t30d, t1y)
    .first<{
      last_price: number | null;
      last_time: number | null;
      first_time: number | null;
      vol_24h: number;
      vol_30d: number;
      vol_1y: number;
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
  const [price24hAgo, price30dAgo, price1yAgo, allTime, dispenserInfo] = await Promise.all([
    db
      .prepare(
        `SELECT price FROM dispenses
         WHERE asset = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(asset, t24h)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT price FROM dispenses
         WHERE asset = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(asset, t30d)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT price FROM dispenses
         WHERE asset = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(asset, t1y)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(btc_amount), 0) as total_btc,
                COALESCE(SUM(dispense_quantity), 0) as total_qty,
                COUNT(*) as total_cnt,
                COUNT(DISTINCT destination) as buyers
         FROM dispenses WHERE asset = ?`
      )
      .bind(asset)
      .first<{ total_btc: number; total_qty: number; total_cnt: number; buyers: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as total_created,
                COUNT(DISTINCT source) as unique_sellers,
                SUM(CASE WHEN status < 10 THEN 1 ELSE 0 END) as active_dispensers,
                COALESCE(SUM(CASE WHEN status < 10 THEN give_remaining ELSE 0 END), 0) as total_available,
                MIN(CASE WHEN status < 10 AND price > 0 THEN price END) as cheapest_price
         FROM dispensers WHERE asset = ?`
      )
      .bind(asset)
      .first<{ total_created: number; unique_sellers: number; active_dispensers: number; total_available: number; cheapest_price: number | null }>(),
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

  const totalBtc = allTime?.total_btc ?? 0;
  const totalDispensed = allTime?.total_qty ?? 0;
  const totalDispenseCount = allTime?.total_cnt ?? 0;
  const uniqueBuyers = allTime?.buyers ?? 0;
  const uniqueSellers = dispenserInfo?.unique_sellers ?? 0;
  const totalDispensersCreated = dispenserInfo?.total_created ?? 0;
  const avgDispenseBtc = totalDispenseCount > 0 ? totalBtc / totalDispenseCount : 0;

  await db
    .prepare(
      `INSERT INTO dispenser_stats
         (asset, asset_longname, last_dispense_price, last_dispense_time,
          price_change_24h, price_change_30d, price_change_1y,
          volume_24h, volume_30d, volume_1y,
          high_24h, low_24h, high_30d, low_30d, high_1y, low_1y,
          dispense_count_24h, dispense_count_30d, dispense_count_1y,
          first_dispense_time,
          total_btc_spent, total_dispensed, total_dispense_count,
          unique_buyers, unique_sellers, total_dispensers_created, avg_dispense_btc,
          active_dispensers, total_available, cheapest_price,
          updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (asset) DO UPDATE SET
         asset_longname = COALESCE(dispenser_stats.asset_longname, excluded.asset_longname),
         last_dispense_price = excluded.last_dispense_price,
         last_dispense_time = excluded.last_dispense_time,
         price_change_24h = excluded.price_change_24h,
         price_change_30d = excluded.price_change_30d,
         price_change_1y = excluded.price_change_1y,
         volume_24h = excluded.volume_24h,
         volume_30d = excluded.volume_30d,
         volume_1y = excluded.volume_1y,
         high_24h = excluded.high_24h,
         low_24h = excluded.low_24h,
         high_30d = excluded.high_30d,
         low_30d = excluded.low_30d,
         high_1y = excluded.high_1y,
         low_1y = excluded.low_1y,
         dispense_count_24h = excluded.dispense_count_24h,
         dispense_count_30d = excluded.dispense_count_30d,
         dispense_count_1y = excluded.dispense_count_1y,
         first_dispense_time = excluded.first_dispense_time,
         total_btc_spent = excluded.total_btc_spent,
         total_dispensed = excluded.total_dispensed,
         total_dispense_count = excluded.total_dispense_count,
         unique_buyers = excluded.unique_buyers,
         unique_sellers = excluded.unique_sellers,
         total_dispensers_created = excluded.total_dispensers_created,
         avg_dispense_btc = excluded.avg_dispense_btc,
         active_dispensers = excluded.active_dispensers,
         total_available = excluded.total_available,
         cheapest_price = excluded.cheapest_price,
         updated_at = excluded.updated_at`
    )
    .bind(
      asset,
      assetLongname ?? null,
      lastPrice,
      stats?.last_time ?? null,
      priceChange24h,
      priceChange30d,
      priceChange1y,
      stats?.vol_24h ?? 0,
      stats?.vol_30d ?? 0,
      stats?.vol_1y ?? 0,
      stats?.hi_24h ?? null,
      stats?.lo_24h ?? null,
      stats?.hi_30d ?? null,
      stats?.lo_30d ?? null,
      stats?.hi_1y ?? null,
      stats?.lo_1y ?? null,
      stats?.cnt_24h ?? 0,
      stats?.cnt_30d ?? 0,
      stats?.cnt_1y ?? 0,
      stats?.first_time ?? null,
      totalBtc,
      totalDispensed,
      totalDispenseCount,
      uniqueBuyers,
      uniqueSellers,
      totalDispensersCreated,
      avgDispenseBtc,
      dispenserInfo?.active_dispensers ?? 0,
      dispenserInfo?.total_available ?? 0,
      dispenserInfo?.cheapest_price ?? null,
      now
    )
    .run();
}

/**
 * Refresh stale rolling-window stats for dispenser assets that had recent
 * activity but haven't had a dispense in a while. Covers the short windows
 * (24h, 30d); the year window is swept separately by
 * refreshLongWindowDispenserStats.
 */
export async function refreshStaleDispenserStats(
  db: D1Database
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const t30d = now - 2592000;

  // Refresh all assets that had any dispense in the last 30 days or have
  // non-zero rolling stats — ensures updated_at stays current
  const staleAssets = await db
    .prepare(
      `SELECT asset FROM dispenser_stats
       WHERE last_dispense_time IS NOT NULL AND (
         last_dispense_time >= ?1
         OR dispense_count_24h > 0 OR volume_24h > 0
         OR dispense_count_30d > 0 OR volume_30d > 0
       )`
    )
    .bind(t30d)
    .all<{ asset: string }>();

  if (staleAssets.results.length > 0) {
    await bulkUpdateDispenserStats(db, staleAssets.results.map((a) => a.asset));
  }

  return staleAssets.results.length;
}

/**
 * Daily sweep of the year window - the dispenser twin of
 * refreshLongWindowPairStats. Selects on last_dispense_time so assets whose
 * year columns still hold pre-rename 7-day values are repriced, and on the
 * stored year totals so an asset whose last dispense ages out of the window
 * gets zeroed rather than frozen.
 */
export async function refreshLongWindowDispenserStats(
  db: D1Database
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const t1y = now - 31536000;

  const assets = await db
    .prepare(
      `SELECT asset FROM dispenser_stats
       WHERE last_dispense_time IS NOT NULL AND (
         last_dispense_time >= ?1
         OR dispense_count_1y > 0 OR volume_1y > 0
       )`
    )
    .bind(t1y)
    .all<{ asset: string }>();

  if (assets.results.length > 0) {
    await bulkUpdateDispenserStats(db, assets.results.map((a) => a.asset));
  }

  return assets.results.length;
}
