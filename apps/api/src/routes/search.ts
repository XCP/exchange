export async function handleSearch(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return Response.json(
      { pairs: [], dispensers: [] },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }

  const like = `%${q}%`;

  const [pairResult, dispenserResult] = await db.batch([
    db
      .prepare(
        `SELECT pair, base_asset, quote_asset, base_asset_longname, last_price, volume_24h
         FROM pair_stats
         WHERE hidden = 0
           AND (pair LIKE ?1 OR base_asset LIKE ?1 OR quote_asset LIKE ?1 OR base_asset_longname LIKE ?1)
         ORDER BY volume_24h DESC
         LIMIT 5`
      )
      .bind(like),
    db
      .prepare(
        `SELECT asset, asset_longname, last_dispense_price, cheapest_price, volume_24h, active_dispensers
         FROM dispenser_stats
         WHERE hidden = 0
           AND (asset LIKE ?1 OR asset_longname LIKE ?1)
         ORDER BY volume_24h DESC
         LIMIT 5`
      )
      .bind(like),
  ]);

  return Response.json(
    {
      pairs: pairResult.results,
      dispensers: dispenserResult.results,
    },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
