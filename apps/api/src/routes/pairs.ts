const VALID_SORTS = new Set(["volume_24h", "trade_count_24h", "last_trade_time", "total_volume"]);

export async function handlePair(
  db: D1Database,
  pair: string
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, last_price, last_trade_time,
              last_side, price_change_24h, price_change_7d, price_change_30d,
              volume_24h, volume_7d, volume_30d,
              high_24h, low_24h, high_7d, low_7d, high_30d, low_30d,
              trade_count_24h, trade_count_7d, trade_count_30d,
              first_trade_time,
              total_volume, total_base_volume, total_trade_count, unique_traders, all_time_high, all_time_low,
              base_volume_24h, base_volume_7d, base_volume_30d
       FROM pair_stats WHERE pair = ?`
    )
    .bind(pair)
    .first();

  if (!row) {
    return Response.json({ error: "Pair not found" }, { status: 404 });
  }

  return Response.json(row, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}

export async function handlePairs(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const sort = VALID_SORTS.has(url.searchParams.get("sort") ?? "")
    ? url.searchParams.get("sort")!
    : "volume_24h";
  const quote = url.searchParams.get("quote");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );

  const base = url.searchParams.get("base");
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  let query = `SELECT pair, base_asset, quote_asset, last_price, last_trade_time,
                      last_side, price_change_24h, price_change_7d, price_change_30d,
                      volume_24h, volume_7d, volume_30d,
                      high_24h, low_24h, high_7d, low_7d, high_30d, low_30d,
                      trade_count_24h, trade_count_7d, trade_count_30d,
                      first_trade_time,
                      total_volume, total_base_volume, total_trade_count, unique_traders, all_time_high, all_time_low,
                      base_volume_24h, base_volume_7d, base_volume_30d
               FROM pair_stats`;
  const binds: (string | number)[] = [];
  const conditions: string[] = [];

  if (quote) {
    conditions.push(`quote_asset = ?`);
    binds.push(quote);
  }
  if (base) {
    conditions.push(`base_asset = ?`);
    binds.push(base);
  }
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  // D1 doesn't support parameterized ORDER BY, but sort is validated above
  query += ` ORDER BY ${sort} DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  // Count query (same conditions, no LIMIT/OFFSET)
  let countQuery = `SELECT COUNT(*) as total FROM pair_stats`;
  const countBinds = binds.slice(0, -2); // strip limit and offset
  if (conditions.length > 0) {
    countQuery += ` WHERE ${conditions.join(" AND ")}`;
  }

  const [result, countResult] = await Promise.all([
    db.prepare(query).bind(...binds).all(),
    db.prepare(countQuery).bind(...countBinds).first<{ total: number }>(),
  ]);

  return Response.json(
    { pairs: result.results, total: countResult?.total ?? 0, limit, offset },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
