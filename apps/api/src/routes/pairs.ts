const VALID_SORTS = new Set(["volume_24h", "trade_count_24h", "last_trade_time"]);

export async function handlePair(
  db: D1Database,
  pair: string
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, last_price, last_trade_time,
              last_side, price_change_24h, price_change_7d,
              volume_24h, volume_7d, volume_30d,
              high_24h, low_24h,
              trade_count_24h, trade_count_7d, trade_count_30d,
              first_trade_time
       FROM pair_stats WHERE pair = ?`
    )
    .bind(pair)
    .first();

  if (!row) {
    return Response.json({ error: "Pair not found" }, { status: 404 });
  }

  return Response.json(row, {
    headers: { "Cache-Control": "public, max-age=30" },
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

  let query = `SELECT pair, base_asset, quote_asset, last_price, last_trade_time,
                      last_side, price_change_24h, price_change_7d,
                      volume_24h, volume_7d, volume_30d,
                      high_24h, low_24h,
                      trade_count_24h, trade_count_7d, trade_count_30d,
                      first_trade_time
               FROM pair_stats`;
  const binds: (string | number)[] = [];

  if (quote) {
    query += ` WHERE quote_asset = ?`;
    binds.push(quote);
  }

  // D1 doesn't support parameterized ORDER BY, but sort is validated above
  query += ` ORDER BY ${sort} DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all();

  return Response.json(
    { pairs: result.results },
    {
      headers: {
        "Cache-Control": "public, max-age=30",
      },
    }
  );
}
