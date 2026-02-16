export async function handleTradeSummary(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const includeHidden = url.searchParams.get("include_hidden") === "1";
  const hiddenFilter = includeHidden ? "" : " WHERE hidden = 0";

  const row = await db
    .prepare(
      `SELECT
        COUNT(*) as total_pairs,
        SUM(CASE WHEN trade_count_24h > 0 THEN 1 ELSE 0 END) as active_pairs_24h,
        COALESCE(SUM(volume_24h), 0) as volume_24h,
        COALESCE(SUM(trade_count_24h), 0) as trades_24h,
        COALESCE(SUM(total_trade_count), 0) as total_trades
       FROM pair_stats${hiddenFilter}`
    )
    .first();

  return Response.json(row ?? {}, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
