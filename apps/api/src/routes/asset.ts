export async function handleAsset(
  db: D1Database,
  asset: string
): Promise<Response> {
  // Aggregate demand/supply across all pairs this asset appears in
  const pressure = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE
          WHEN base_asset = ?1 AND side = 'bid' THEN amount
          WHEN quote_asset = ?1 AND side = 'ask' THEN get_remaining
          ELSE 0 END), 0) as buy_pressure,
        COALESCE(SUM(CASE
          WHEN base_asset = ?1 AND side = 'ask' THEN amount
          WHEN quote_asset = ?1 AND side = 'bid' THEN give_remaining
          ELSE 0 END), 0) as sell_pressure,
        COUNT(*) as total_orders
       FROM orders
       WHERE status = 'open' AND (base_asset = ?1 OR quote_asset = ?1)`
    )
    .bind(asset)
    .first<{ buy_pressure: number; sell_pressure: number; total_orders: number }>();

  // Per-pair breakdown
  const pairs = await db
    .prepare(
      `SELECT pair, side,
              COUNT(*) as order_count,
              SUM(amount) as total_amount,
              MIN(price) as min_price,
              MAX(price) as max_price
       FROM orders
       WHERE status = 'open' AND (base_asset = ?1 OR quote_asset = ?1)
       GROUP BY pair, side
       ORDER BY order_count DESC`
    )
    .bind(asset)
    .all();

  // Last trade info across all pairs
  const lastTrade = await db
    .prepare(
      `SELECT pair, price, amount, side, block_time
       FROM trades
       WHERE base_asset = ? OR quote_asset = ?
       ORDER BY block_time DESC LIMIT 1`
    )
    .bind(asset, asset)
    .first();

  const buyPressure = pressure?.buy_pressure ?? 0;
  const sellPressure = pressure?.sell_pressure ?? 0;
  const netPressure = buyPressure - sellPressure;

  return Response.json(
    {
      asset,
      buy_pressure: buyPressure,
      sell_pressure: sellPressure,
      net_pressure: netPressure,
      pressure_ratio: sellPressure > 0 ? buyPressure / sellPressure : null,
      total_orders: pressure?.total_orders ?? 0,
      pairs: pairs.results,
      last_trade: lastTrade,
    },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
