import { batchExec } from "../lib/batch";

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
  asset: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t7d = now - 604800;
  const t30d = now - 2592000;

  // Single consolidated query for latest, first, and windowed stats
  const stats = await db
    .prepare(
      `SELECT
        (SELECT price FROM dispenses WHERE asset = ?1 ORDER BY block_time DESC LIMIT 1) as last_price,
        (SELECT block_time FROM dispenses WHERE asset = ?1 ORDER BY block_time DESC LIMIT 1) as last_time,
        (SELECT block_time FROM dispenses WHERE asset = ?1 ORDER BY block_time ASC LIMIT 1) as first_time,
        COALESCE(SUM(CASE WHEN block_time >= ?2 THEN btc_amount ELSE 0 END), 0) as vol_24h,
        COALESCE(SUM(CASE WHEN block_time >= ?3 THEN btc_amount ELSE 0 END), 0) as vol_7d,
        COALESCE(SUM(CASE WHEN block_time >= ?4 THEN btc_amount ELSE 0 END), 0) as vol_30d,
        SUM(CASE WHEN block_time >= ?2 THEN 1 ELSE 0 END) as cnt_24h,
        SUM(CASE WHEN block_time >= ?3 THEN 1 ELSE 0 END) as cnt_7d,
        SUM(CASE WHEN block_time >= ?4 THEN 1 ELSE 0 END) as cnt_30d,
        MAX(CASE WHEN block_time >= ?2 THEN price END) as hi_24h,
        MIN(CASE WHEN block_time >= ?2 THEN price END) as lo_24h,
        MAX(CASE WHEN block_time >= ?3 THEN price END) as hi_7d,
        MIN(CASE WHEN block_time >= ?3 THEN price END) as lo_7d,
        MAX(CASE WHEN block_time >= ?4 THEN price END) as hi_30d,
        MIN(CASE WHEN block_time >= ?4 THEN price END) as lo_30d
       FROM dispenses WHERE asset = ?1 AND block_time >= ?4`
    )
    .bind(asset, t24h, t7d, t30d)
    .first<{
      last_price: number | null;
      last_time: number | null;
      first_time: number | null;
      vol_24h: number;
      vol_7d: number;
      vol_30d: number;
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

  // Price change lookups (need separate queries for the <= boundary)
  const [price24hAgo, price7dAgo, price30dAgo] = await Promise.all([
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
      .bind(asset, t7d)
      .first<{ price: number }>(),
    db
      .prepare(
        `SELECT price FROM dispenses
         WHERE asset = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
      )
      .bind(asset, t30d)
      .first<{ price: number }>(),
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
      `INSERT INTO dispenser_stats
         (asset, last_dispense_price, last_dispense_time,
          price_change_24h, price_change_7d, price_change_30d,
          volume_24h, volume_7d, volume_30d,
          high_24h, low_24h, high_7d, low_7d, high_30d, low_30d,
          dispense_count_24h, dispense_count_7d, dispense_count_30d,
          first_dispense_time, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (asset) DO UPDATE SET
         last_dispense_price = excluded.last_dispense_price,
         last_dispense_time = excluded.last_dispense_time,
         price_change_24h = excluded.price_change_24h,
         price_change_7d = excluded.price_change_7d,
         price_change_30d = excluded.price_change_30d,
         volume_24h = excluded.volume_24h,
         volume_7d = excluded.volume_7d,
         volume_30d = excluded.volume_30d,
         high_24h = excluded.high_24h,
         low_24h = excluded.low_24h,
         high_7d = excluded.high_7d,
         low_7d = excluded.low_7d,
         high_30d = excluded.high_30d,
         low_30d = excluded.low_30d,
         dispense_count_24h = excluded.dispense_count_24h,
         dispense_count_7d = excluded.dispense_count_7d,
         dispense_count_30d = excluded.dispense_count_30d,
         first_dispense_time = excluded.first_dispense_time,
         updated_at = excluded.updated_at`
    )
    .bind(
      asset,
      lastPrice,
      stats?.last_time ?? null,
      priceChange24h,
      priceChange7d,
      priceChange30d,
      stats?.vol_24h ?? 0,
      stats?.vol_7d ?? 0,
      stats?.vol_30d ?? 0,
      stats?.hi_24h ?? null,
      stats?.lo_24h ?? null,
      stats?.hi_7d ?? null,
      stats?.lo_7d ?? null,
      stats?.hi_30d ?? null,
      stats?.lo_30d ?? null,
      stats?.cnt_24h ?? 0,
      stats?.cnt_7d ?? 0,
      stats?.cnt_30d ?? 0,
      stats?.first_time ?? null,
      now
    )
    .run();
}

/**
 * Refresh stale rolling-window stats for dispenser assets that had recent
 * activity but haven't had a dispense in a while. Covers all three time
 * windows (24h, 7d, 30d).
 */
export async function refreshStaleDispenserStats(
  db: D1Database
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t7d = now - 604800;
  const t30d = now - 2592000;

  // Find assets where any rolling window has non-zero metrics but last dispense
  // has moved outside that window
  const staleAssets = await db
    .prepare(
      `SELECT asset FROM dispenser_stats
       WHERE last_dispense_time IS NOT NULL AND (
         ((dispense_count_24h > 0 OR volume_24h > 0) AND last_dispense_time < ?1)
         OR ((dispense_count_7d > 0 OR volume_7d > 0) AND last_dispense_time < ?2)
         OR ((dispense_count_30d > 0 OR volume_30d > 0) AND last_dispense_time < ?3)
       )`
    )
    .bind(t24h, t7d, t30d)
    .all<{ asset: string }>();

  for (const a of staleAssets.results) {
    await updateDispenserStats(db, a.asset);
  }

  return staleAssets.results.length;
}
