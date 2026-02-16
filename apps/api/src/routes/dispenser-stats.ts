export async function handleDispenserStatsList(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const sortCol = url.searchParams.get("sort") ?? "volume_24h";
  const allowedSorts = [
    "volume_24h", "volume_7d", "volume_30d", "total_btc_spent",
    "dispense_count_24h", "dispense_count_7d", "dispense_count_30d", "total_dispense_count",
    "price_change_24h", "price_change_7d", "price_change_30d",
    "active_dispensers", "cheapest_price", "total_available",
    "last_dispense_time", "unique_buyers",
  ];
  const sort = allowedSorts.includes(sortCol) ? sortCol : "volume_24h";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10),
    200
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const includeHidden = url.searchParams.get("include_hidden") === "1";
  const hiddenFilter = includeHidden ? "" : " AND ds.hidden = 0";
  const hiddenFilterCount = includeHidden ? "" : " AND hidden = 0";
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
  const tfParam = url.searchParams.get("timeframe");
  const tf = tfParam === "7d" || tfParam === "30d" || tfParam === "all" ? tfParam : "24h";
  const activityFilter = tf === "all" ? ` AND ds.total_dispense_count >= 5` : ` AND ds.dispense_count_${tf} > 0`;
  const activityFilterCount = tf === "all" ? ` AND total_dispense_count >= 5` : ` AND dispense_count_${tf} > 0`;

  const [countResult, rows, summaryResult] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) as total FROM dispenser_stats WHERE active_dispensers > 0${hiddenFilterCount}${activityFilterCount}`
    ),
    db.prepare(
      `SELECT ds.asset, ds.asset_longname, ds.last_dispense_price, ds.last_dispense_time,
              ds.price_change_24h, ds.price_change_7d, ds.price_change_30d,
              ds.volume_24h, ds.volume_7d, ds.volume_30d,
              ds.high_24h, ds.low_24h, ds.high_7d, ds.low_7d, ds.high_30d, ds.low_30d,
              ds.dispense_count_24h, ds.dispense_count_7d, ds.dispense_count_30d,
              ds.active_dispensers, ds.total_available,
              ds.first_dispense_time, ds.updated_at,
              ds.total_btc_spent, ds.total_dispensed, ds.total_dispense_count,
              ds.unique_buyers, ds.unique_sellers, ds.total_dispensers_created, ds.avg_dispense_btc,
              (SELECT MIN(price) FROM dispensers
               WHERE asset = ds.asset AND status < 10 AND price > 0 AND give_remaining > 0) AS cheapest_price,
              (SELECT SUM(price * give_remaining) / SUM(give_remaining) FROM dispensers
               WHERE asset = ds.asset AND status < 10 AND price > 0 AND give_remaining > 0) AS avg_price
       FROM dispenser_stats ds
       WHERE ds.active_dispensers > 0${hiddenFilter}${activityFilter}
       ORDER BY ${sort} ${order}
       LIMIT ? OFFSET ?`
    ).bind(limit, offset),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM dispensers d WHERE d.status < 10${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM dispenser_stats s WHERE s.asset = d.asset AND s.hidden = 1)"}) AS total_dispensers,
         (SELECT COUNT(*) FROM dispenses p${includeHidden ? "" : " WHERE NOT EXISTS (SELECT 1 FROM dispenser_stats s WHERE s.asset = p.asset AND s.hidden = 1)"}) AS total_dispenses,
         (SELECT COALESCE(SUM(p.btc_amount), 0) FROM dispenses p${includeHidden ? "" : " WHERE NOT EXISTS (SELECT 1 FROM dispenser_stats s WHERE s.asset = p.asset AND s.hidden = 1)"}) AS total_btc_volume,
         (SELECT COUNT(DISTINCT p.destination) FROM dispenses p${includeHidden ? "" : " WHERE NOT EXISTS (SELECT 1 FROM dispenser_stats s WHERE s.asset = p.asset AND s.hidden = 1)"}) AS unique_buyers`
    ),
  ]);

  const total =
    (countResult.results[0] as { total: number } | undefined)?.total ?? 0;
  const summary = summaryResult.results[0] as {
    total_dispensers: number;
    total_dispenses: number;
    total_btc_volume: number;
    unique_buyers: number;
  } | undefined;

  return Response.json(
    {
      dispenser_markets: rows.results,
      total,
      limit,
      offset,
      summary: {
        total_dispensers: summary?.total_dispensers ?? 0,
        total_dispenses: summary?.total_dispenses ?? 0,
        total_btc_volume: summary?.total_btc_volume ?? 0,
        unique_buyers: summary?.unique_buyers ?? 0,
      },
    },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}

export async function handleDispenserStats(
  db: D1Database,
  asset: string
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT ds.asset, ds.last_dispense_price, ds.last_dispense_time,
              ds.price_change_24h, ds.price_change_7d, ds.price_change_30d,
              ds.volume_24h, ds.volume_7d, ds.volume_30d,
              ds.high_24h, ds.low_24h, ds.high_7d, ds.low_7d, ds.high_30d, ds.low_30d,
              ds.dispense_count_24h, ds.dispense_count_7d, ds.dispense_count_30d,
              ds.active_dispensers, ds.total_available,
              (SELECT MIN(price) FROM dispensers
               WHERE asset = ds.asset AND status < 10 AND price > 0 AND give_remaining > 0) AS cheapest_price,
              ds.first_dispense_time, ds.updated_at,
              ds.total_btc_spent, ds.total_dispensed, ds.total_dispense_count,
              ds.unique_buyers, ds.unique_sellers, ds.total_dispensers_created, ds.avg_dispense_btc,
              (SELECT SUM(price * give_remaining) / SUM(give_remaining) FROM dispensers
               WHERE asset = ds.asset AND status < 10 AND price > 0 AND give_remaining > 0) AS avg_price
       FROM dispenser_stats ds WHERE ds.asset = ?`
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
        total_btc_spent: null,
        total_dispensed: null,
        total_dispense_count: null,
        unique_buyers: null,
        unique_sellers: null,
        total_dispensers_created: null,
        avg_dispense_btc: null,
      },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  }

  return Response.json(row, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
