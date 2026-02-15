export async function updatePairStats(
  db: D1Database,
  pair: string,
  baseAsset: string,
  quoteAsset: string
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
      `INSERT INTO pair_stats (pair, base_asset, quote_asset, last_price, last_trade_time, last_side,
         price_change_24h, price_change_7d, price_change_30d,
         volume_24h, volume_7d, volume_30d,
         high_24h, low_24h, high_7d, low_7d, high_30d, low_30d,
         trade_count_24h, trade_count_7d, trade_count_30d,
         first_trade_time, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (pair) DO UPDATE SET
         last_price = excluded.last_price,
         last_trade_time = excluded.last_trade_time,
         last_side = excluded.last_side,
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
         trade_count_24h = excluded.trade_count_24h,
         trade_count_7d = excluded.trade_count_7d,
         trade_count_30d = excluded.trade_count_30d,
         first_trade_time = excluded.first_trade_time,
         updated_at = excluded.updated_at`
    )
    .bind(
      pair,
      baseAsset,
      quoteAsset,
      lastPrice,
      stats?.last_trade_time ?? null,
      stats?.last_side ?? null,
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
      stats?.first_trade_time ?? null,
      now
    )
    .run();
}
