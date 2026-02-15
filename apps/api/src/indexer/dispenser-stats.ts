export async function updateDispenserStats(
  db: D1Database,
  asset: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const t24h = now - 86400;
  const t7d = now - 604800;
  const t30d = now - 2592000;

  // Get the latest dispense
  const latest = await db
    .prepare(
      `SELECT price, block_time FROM dispenses
       WHERE asset = ? ORDER BY block_time DESC LIMIT 1`
    )
    .bind(asset)
    .first<{ price: number; block_time: number }>();

  // Get the first dispense
  const first = await db
    .prepare(
      `SELECT block_time FROM dispenses
       WHERE asset = ? ORDER BY block_time ASC LIMIT 1`
    )
    .bind(asset)
    .first<{ block_time: number }>();

  // Get 24h stats (volume, count, high, low)
  const stats24h = await db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(btc_amount), 0) as vol,
              MAX(price) as hi, MIN(price) as lo
       FROM dispenses WHERE asset = ? AND block_time >= ?`
    )
    .bind(asset, t24h)
    .first<{ cnt: number; vol: number; hi: number | null; lo: number | null }>();

  // Get 7d stats (volume, count, high, low)
  const stats7d = await db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(btc_amount), 0) as vol,
              MAX(price) as hi, MIN(price) as lo
       FROM dispenses WHERE asset = ? AND block_time >= ?`
    )
    .bind(asset, t7d)
    .first<{ cnt: number; vol: number; hi: number | null; lo: number | null }>();

  // Get 30d stats (volume, count, high, low)
  const stats30d = await db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(btc_amount), 0) as vol,
              MAX(price) as hi, MIN(price) as lo
       FROM dispenses WHERE asset = ? AND block_time >= ?`
    )
    .bind(asset, t30d)
    .first<{ cnt: number; vol: number; hi: number | null; lo: number | null }>();

  // Price change calculations
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

  const lastPrice = latest?.price ?? null;
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
      latest?.block_time ?? null,
      priceChange24h,
      priceChange7d,
      priceChange30d,
      stats24h?.vol ?? 0,
      stats7d?.vol ?? 0,
      stats30d?.vol ?? 0,
      stats24h?.hi ?? null,
      stats24h?.lo ?? null,
      stats7d?.hi ?? null,
      stats7d?.lo ?? null,
      stats30d?.hi ?? null,
      stats30d?.lo ?? null,
      stats24h?.cnt ?? 0,
      stats7d?.cnt ?? 0,
      stats30d?.cnt ?? 0,
      first?.block_time ?? null,
      now
    )
    .run();
}
