export async function handleMarkets(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const quote = url.searchParams.get("quote");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  // Pairs with open orders, enriched with trade stats if available
  let query = `SELECT
    ps.pair, ps.base_asset, ps.quote_asset,
    ps.last_price, ps.last_trade_time, ps.last_side,
    ps.price_change_24h, ps.volume_24h, ps.trade_count_24h,
    ps.open_orders, ps.bid_count, ps.ask_count,
    ps.best_bid, ps.best_ask, ps.spread
  FROM pair_stats ps
  WHERE ps.open_orders > 0`;
  const binds: (string | number)[] = [];

  if (quote) {
    query += ` AND ps.quote_asset = ?`;
    binds.push(quote);
  }

  query += ` ORDER BY ps.open_orders DESC, ps.volume_24h DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  // Count query (same conditions, no LIMIT/OFFSET)
  let countQuery = `SELECT COUNT(*) as total FROM pair_stats ps WHERE ps.open_orders > 0`;
  const countBinds = binds.slice(0, -2);
  if (quote) {
    countQuery += ` AND ps.quote_asset = ?`;
  }

  const [result, countResult] = await Promise.all([
    db.prepare(query).bind(...binds).all(),
    db.prepare(countQuery).bind(...countBinds).first<{ total: number }>(),
  ]);

  return Response.json(
    { markets: result.results, total: countResult?.total ?? 0, limit, offset },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
