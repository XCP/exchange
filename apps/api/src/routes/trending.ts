export async function handleTrending(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const resultLimit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "10", 10) || 10,
    50
  );
  // Get all pairs with recent activity for scoring
  const result = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, last_price, last_trade_time,
              price_change_24h, volume_24h, trade_count_24h
       FROM pair_stats
       WHERE trade_count_24h > 0
       ORDER BY trade_count_24h DESC
       LIMIT 100`
    )
    .all<{
      pair: string;
      base_asset: string;
      quote_asset: string;
      last_price: number | null;
      last_trade_time: number | null;
      price_change_24h: number;
      volume_24h: number;
      trade_count_24h: number;
    }>();

  if (!result.results.length) {
    return Response.json(
      { trending: [] },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }

  // Normalize volume to 0-1 for scoring
  const maxVolume = Math.max(...result.results.map((p) => p.volume_24h));
  const maxTrades = Math.max(...result.results.map((p) => p.trade_count_24h));

  const scored = result.results.map((p) => {
    const normVolume = maxVolume > 0 ? p.volume_24h / maxVolume : 0;
    const normTrades = maxTrades > 0 ? p.trade_count_24h / maxTrades : 0;
    const normChange = Math.min(Math.abs(p.price_change_24h) / 100, 1);

    const score = normTrades * 0.4 + normVolume * 0.4 + normChange * 0.2;

    return { ...p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const trending = scored.slice(0, resultLimit).map(({ score, ...rest }) => rest);

  return Response.json(
    { trending },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
