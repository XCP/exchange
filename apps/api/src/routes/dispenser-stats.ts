export async function handleDispenserStats(
  db: D1Database,
  asset: string
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT asset, last_dispense_price, last_dispense_time,
              price_change_24h, price_change_7d, price_change_30d,
              volume_24h, volume_7d, volume_30d,
              high_24h, low_24h, high_7d, low_7d, high_30d, low_30d,
              dispense_count_24h, dispense_count_7d, dispense_count_30d,
              active_dispensers, total_available, cheapest_price,
              first_dispense_time, updated_at
       FROM dispenser_stats WHERE asset = ?`
    )
    .bind(asset)
    .first();

  if (!row) {
    // Return empty stub so frontend doesn't error
    return Response.json(
      {
        asset,
        last_dispense_price: null,
        last_dispense_time: null,
        price_change_24h: 0,
        price_change_7d: 0,
        price_change_30d: 0,
        volume_24h: 0,
        volume_7d: 0,
        volume_30d: 0,
        high_24h: null,
        low_24h: null,
        high_7d: null,
        low_7d: null,
        high_30d: null,
        low_30d: null,
        dispense_count_24h: 0,
        dispense_count_7d: 0,
        dispense_count_30d: 0,
        active_dispensers: 0,
        total_available: 0,
        cheapest_price: null,
        first_dispense_time: null,
        updated_at: null,
      },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  }

  return Response.json(row, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
