export async function handleAnalytics(
  request: Request,
  db: D1Database
): Promise<Response> {
  const [
    tradeSummary,
    dispenseSummary,
    dailyTradeVolume,
    dailyDispenseVolume,
    topPairs,
    topDispensers,
    trendingCandidates,
  ] = await db.batch([
    // 1. Trade summary
    db.prepare(
      `SELECT
        COALESCE(SUM(total_volume), 0) AS total_volume,
        COALESCE(SUM(total_trade_count), 0) AS total_trade_count,
        COUNT(*) AS total_pairs,
        SUM(CASE WHEN trade_count_24h > 0 THEN 1 ELSE 0 END) AS active_pairs_24h,
        COALESCE(SUM(volume_24h), 0) AS volume_24h,
        COALESCE(SUM(trade_count_24h), 0) AS trades_24h,
        (SELECT COUNT(*) FROM orders WHERE status = 'open') AS open_orders
       FROM pair_stats`
    ),
    // 2. Dispense summary
    db.prepare(
      `SELECT
        COALESCE(SUM(total_btc_spent), 0) AS total_btc_spent,
        COALESCE(SUM(total_dispense_count), 0) AS total_dispense_count,
        (SELECT COUNT(*) FROM dispensers WHERE status < 10) AS open_dispensers,
        COALESCE(SUM(volume_24h), 0) AS dispense_vol_24h,
        COALESCE(SUM(dispense_count_24h), 0) AS dispenses_24h
       FROM dispenser_stats`
    ),
    // 3. Daily trade volume (from 1d candles)
    db.prepare(
      `SELECT timestamp, SUM(volume) AS volume, SUM(trades) AS trades
       FROM candles
       WHERE interval = '1d'
       GROUP BY timestamp
       ORDER BY timestamp`
    ),
    // 4. Daily dispense volume
    db.prepare(
      `SELECT (block_time / 86400) * 86400 AS timestamp,
              SUM(btc_amount) AS volume,
              COUNT(*) AS dispenses
       FROM dispenses
       GROUP BY 1
       ORDER BY 1`
    ),
    // 5. Top 10 pairs by 24h volume
    db.prepare(
      `SELECT pair, base_asset, quote_asset, last_price, volume_24h,
              trade_count_24h, price_change_24h
       FROM pair_stats
       WHERE volume_24h > 0
       ORDER BY volume_24h DESC
       LIMIT 10`
    ),
    // 6. Top 10 dispenser assets by 24h volume
    db.prepare(
      `SELECT ds.asset, ds.asset_longname, ds.volume_24h, ds.dispense_count_24h,
              ds.last_dispense_price, ds.price_change_24h, ds.active_dispensers
       FROM dispenser_stats ds
       WHERE ds.hidden = 0 AND ds.volume_24h > 0
       ORDER BY ds.volume_24h DESC
       LIMIT 10`
    ),
    // 7. Top 100 active pairs for trending scoring
    db.prepare(
      `SELECT pair, base_asset, quote_asset, last_price, last_trade_time,
              price_change_24h, volume_24h, trade_count_24h
       FROM pair_stats
       WHERE trade_count_24h > 0
       ORDER BY trade_count_24h DESC
       LIMIT 100`
    ),
  ]);

  // Score trending (same algorithm as /trending)
  const candidates = trendingCandidates.results as {
    pair: string;
    base_asset: string;
    quote_asset: string;
    last_price: number | null;
    last_trade_time: number | null;
    price_change_24h: number;
    volume_24h: number;
    trade_count_24h: number;
  }[];

  let trending: typeof candidates = [];
  if (candidates.length > 0) {
    const maxVolume = Math.max(...candidates.map((p) => p.volume_24h));
    const maxTrades = Math.max(...candidates.map((p) => p.trade_count_24h));

    const scored = candidates.map((p) => {
      const normVolume = maxVolume > 0 ? p.volume_24h / maxVolume : 0;
      const normTrades = maxTrades > 0 ? p.trade_count_24h / maxTrades : 0;
      const normChange = Math.min(Math.abs(p.price_change_24h) / 100, 1);
      const score = normTrades * 0.4 + normVolume * 0.4 + normChange * 0.2;
      return { ...p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    trending = scored.slice(0, 10).map(({ score, ...rest }) => rest);
  }

  const trade = tradeSummary.results[0] as Record<string, number> | undefined;
  const dispense = dispenseSummary.results[0] as Record<string, number> | undefined;

  return Response.json(
    {
      trade_summary: {
        total_volume: trade?.total_volume ?? 0,
        total_trade_count: trade?.total_trade_count ?? 0,
        total_pairs: trade?.total_pairs ?? 0,
        active_pairs_24h: trade?.active_pairs_24h ?? 0,
        volume_24h: trade?.volume_24h ?? 0,
        trades_24h: trade?.trades_24h ?? 0,
        open_orders: trade?.open_orders ?? 0,
      },
      dispense_summary: {
        total_btc_spent: dispense?.total_btc_spent ?? 0,
        total_dispense_count: dispense?.total_dispense_count ?? 0,
        open_dispensers: dispense?.open_dispensers ?? 0,
        dispense_vol_24h: dispense?.dispense_vol_24h ?? 0,
        dispenses_24h: dispense?.dispenses_24h ?? 0,
      },
      daily_trade_volume: dailyTradeVolume.results,
      daily_dispense_volume: dailyDispenseVolume.results,
      top_pairs: topPairs.results,
      top_dispensers: topDispensers.results,
      trending,
    },
    {
      headers: { "Cache-Control": "public, max-age=300" },
    }
  );
}
