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

  // Get the latest trade
  const latest = await db
    .prepare(
      `SELECT price, block_time, side FROM trades
       WHERE pair = ? ORDER BY block_time DESC LIMIT 1`
    )
    .bind(pair)
    .first<{ price: number; block_time: number; side: string }>();

  // Get the first trade
  const first = await db
    .prepare(
      `SELECT block_time FROM trades
       WHERE pair = ? ORDER BY block_time ASC LIMIT 1`
    )
    .bind(pair)
    .first<{ block_time: number }>();

  // Get 24h stats
  const stats24h = await db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(volume), 0) as vol,
              MAX(price) as hi, MIN(price) as lo
       FROM trades WHERE pair = ? AND block_time >= ?`
    )
    .bind(pair, t24h)
    .first<{ cnt: number; vol: number; hi: number | null; lo: number | null }>();

  // Get 7d and 30d volume/count
  const stats7d = await db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(volume), 0) as vol
       FROM trades WHERE pair = ? AND block_time >= ?`
    )
    .bind(pair, t7d)
    .first<{ cnt: number; vol: number }>();

  const stats30d = await db
    .prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(volume), 0) as vol
       FROM trades WHERE pair = ? AND block_time >= ?`
    )
    .bind(pair, t30d)
    .first<{ cnt: number; vol: number }>();

  // Price change calculations
  const price24hAgo = await db
    .prepare(
      `SELECT price FROM trades
       WHERE pair = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
    )
    .bind(pair, t24h)
    .first<{ price: number }>();

  const price7dAgo = await db
    .prepare(
      `SELECT price FROM trades
       WHERE pair = ? AND block_time <= ? ORDER BY block_time DESC LIMIT 1`
    )
    .bind(pair, t7d)
    .first<{ price: number }>();

  const lastPrice = latest?.price ?? null;
  const priceChange24h =
    lastPrice && price24hAgo
      ? ((lastPrice - price24hAgo.price) / price24hAgo.price) * 100
      : 0;
  const priceChange7d =
    lastPrice && price7dAgo
      ? ((lastPrice - price7dAgo.price) / price7dAgo.price) * 100
      : 0;

  await db
    .prepare(
      `INSERT INTO pair_stats (pair, base_asset, quote_asset, last_price, last_trade_time, last_side,
         price_change_24h, price_change_7d, volume_24h, volume_7d, volume_30d,
         high_24h, low_24h, trade_count_24h, trade_count_7d, trade_count_30d,
         first_trade_time, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (pair) DO UPDATE SET
         last_price = excluded.last_price,
         last_trade_time = excluded.last_trade_time,
         last_side = excluded.last_side,
         price_change_24h = excluded.price_change_24h,
         price_change_7d = excluded.price_change_7d,
         volume_24h = excluded.volume_24h,
         volume_7d = excluded.volume_7d,
         volume_30d = excluded.volume_30d,
         high_24h = excluded.high_24h,
         low_24h = excluded.low_24h,
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
      latest?.block_time ?? null,
      latest?.side ?? null,
      priceChange24h,
      priceChange7d,
      stats24h?.vol ?? 0,
      stats7d?.vol ?? 0,
      stats30d?.vol ?? 0,
      stats24h?.hi ?? null,
      stats24h?.lo ?? null,
      stats24h?.cnt ?? 0,
      stats7d?.cnt ?? 0,
      stats30d?.cnt ?? 0,
      first?.block_time ?? null,
      now
    )
    .run();
}
