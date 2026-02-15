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

  query += ` ORDER BY ps.open_orders DESC, ps.volume_24h DESC LIMIT ?`;
  binds.push(limit);

  const result = await db.prepare(query).bind(...binds).all();

  return Response.json(
    { markets: result.results },
    {
      headers: {
        "Cache-Control": "public, max-age=30",
      },
    }
  );
}
