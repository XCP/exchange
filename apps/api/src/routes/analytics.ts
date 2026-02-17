export async function handleAnalytics(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const tfParam = url.searchParams.get("timeframe");
  const tf = tfParam === "7d" || tfParam === "30d" || tfParam === "all" ? tfParam : "24h";
  const includeHidden = url.searchParams.get("include_hidden") === "1";

  const pairHidden = includeHidden ? "" : " AND hidden = 0";
  const dispHidden = includeHidden ? "" : " AND ds.hidden = 0";

  // Timeframe-aware column names
  const volCol = tf === "all" ? "total_volume" : `volume_${tf}`;
  const tradeCountCol = tf === "all" ? "total_trade_count" : `trade_count_${tf}`;
  const pctCol = tf === "all" ? "0" : `price_change_${tf}`;
  const dispVolCol = tf === "all" ? "total_btc_spent" : `volume_${tf}`;
  const dispCountCol = tf === "all" ? "total_dispense_count" : `dispense_count_${tf}`;
  const dispPctCol = tf === "all" ? "0" : `price_change_${tf}`;

  const [
    tradeSummary,
    dispenseSummary,
    dailyTradeVolume,
    dailyDispenseVolume,
    dailyBtcTradeVolume,
    topPairs,
    topDispensers,
    trendingCandidates,
    topMakersResult,
    topTakersResult,
    topBtcBuyersResult,
    topBtcSellersResult,
  ] = await db.batch([
    // 1. Trade summary (always shows all-time totals + selected timeframe rolling)
    db.prepare(
      `SELECT
        COALESCE(SUM(total_volume), 0) AS total_volume,
        COALESCE(SUM(total_trade_count), 0) AS total_trade_count,
        COUNT(*) AS total_pairs,
        SUM(CASE WHEN ${tradeCountCol} > 0 THEN 1 ELSE 0 END) AS active_pairs,
        COALESCE(SUM(${volCol}), 0) AS tf_volume,
        COALESCE(SUM(${tradeCountCol}), 0) AS tf_trades,
        (SELECT COUNT(*) FROM orders WHERE status = 'open') AS open_orders
       FROM pair_stats
       WHERE 1=1${pairHidden}`
    ),
    // 2. Dispense summary
    db.prepare(
      `SELECT
        COALESCE(SUM(total_btc_spent), 0) AS total_btc_spent,
        COALESCE(SUM(total_dispense_count), 0) AS total_dispense_count,
        (SELECT COUNT(*) FROM dispensers WHERE status < 10) AS open_dispensers,
        COALESCE(SUM(${dispVolCol}), 0) AS tf_volume,
        COALESCE(SUM(${dispCountCol}), 0) AS tf_dispenses
       FROM dispenser_stats ds
       WHERE 1=1${dispHidden}`
    ),
    // 3. Daily trade volume (XCP-quoted pairs only, quote-denominated)
    db.prepare(
      `SELECT (block_time / 86400) * 86400 AS timestamp,
              ROUND(SUM(volume), 2) AS volume,
              COUNT(*) AS trades
       FROM trades
       WHERE quote_asset = 'XCP'${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM pair_stats ps WHERE ps.pair = trades.pair AND ps.hidden = 1)"}
       GROUP BY 1
       ORDER BY 1`
    ),
    // 4. Daily dispense volume (kept for activity chart)
    db.prepare(
      `SELECT (block_time / 86400) * 86400 AS timestamp,
              SUM(btc_amount) AS volume,
              COUNT(*) AS dispenses
       FROM dispenses
       WHERE 1=1${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM dispenser_stats ds2 WHERE ds2.asset = dispenses.asset AND ds2.hidden = 1)"}
       GROUP BY 1
       ORDER BY 1`
    ),
    // 4b. Daily BTC trade volume (BTC-quoted pairs only)
    db.prepare(
      `SELECT (block_time / 86400) * 86400 AS timestamp,
              ROUND(SUM(volume), 8) AS volume,
              COUNT(*) AS trades
       FROM trades
       WHERE quote_asset = 'BTC'${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM pair_stats ps WHERE ps.pair = trades.pair AND ps.hidden = 1)"}
       GROUP BY 1
       ORDER BY 1`
    ),
    // 5. Top 10 pairs by selected timeframe volume
    db.prepare(
      `SELECT pair, base_asset, quote_asset, base_asset_longname, last_price,
              ${volCol} AS volume, ${tradeCountCol} AS trade_count,
              ${pctCol} AS price_change
       FROM pair_stats
       WHERE ${volCol} > 0${pairHidden}
       ORDER BY ${volCol} DESC
       LIMIT 10`
    ),
    // 6. Top 10 dispenser assets by selected timeframe volume
    db.prepare(
      `SELECT ds.asset, ds.asset_longname,
              ds.${dispVolCol} AS volume, ds.${dispCountCol} AS dispense_count,
              ds.last_dispense_price, ds.${dispPctCol} AS price_change,
              ds.active_dispensers
       FROM dispenser_stats ds
       WHERE ds.${dispVolCol} > 0${dispHidden}
       ORDER BY ds.${dispVolCol} DESC
       LIMIT 10`
    ),
    // 7. Top 100 active pairs for trending scoring
    db.prepare(
      `SELECT pair, base_asset, quote_asset, base_asset_longname, last_price, last_trade_time,
              price_change_24h, volume_24h, trade_count_24h
       FROM pair_stats
       WHERE trade_count_24h > 0${pairHidden}
       ORDER BY trade_count_24h DESC
       LIMIT 100`
    ),
    // 8. Top 10 makers by XCP volume (only XCP-quoted pairs so units are comparable)
    db.prepare(
      `SELECT maker AS address, ROUND(SUM(volume), 2) AS volume, COUNT(*) AS trades
       FROM trades
       WHERE quote_asset = 'XCP'${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM pair_stats ps WHERE ps.pair = trades.pair AND ps.hidden = 1)"}
       GROUP BY maker ORDER BY volume DESC LIMIT 30`
    ),
    // 9. Top 10 takers by XCP volume (only XCP-quoted pairs so units are comparable)
    db.prepare(
      `SELECT taker AS address, ROUND(SUM(volume), 2) AS volume, COUNT(*) AS trades
       FROM trades
       WHERE quote_asset = 'XCP'${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM pair_stats ps WHERE ps.pair = trades.pair AND ps.hidden = 1)"}
       GROUP BY taker ORDER BY volume DESC LIMIT 30`
    ),
    // 10. Top 30 BTC buyers (BTC-quoted trade takers + dispense buyers)
    db.prepare(
      `SELECT address, ROUND(SUM(volume), 8) AS volume, SUM(trades) AS trades FROM (
         SELECT taker AS address, SUM(volume) AS volume, COUNT(*) AS trades
         FROM trades WHERE quote_asset = 'BTC'${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM pair_stats ps WHERE ps.pair = trades.pair AND ps.hidden = 1)"}
         GROUP BY taker
         UNION ALL
         SELECT destination AS address, SUM(btc_amount) AS volume, COUNT(*) AS trades
         FROM dispenses${includeHidden ? "" : " WHERE NOT EXISTS (SELECT 1 FROM dispenser_stats ds2 WHERE ds2.asset = dispenses.asset AND ds2.hidden = 1)"}
         GROUP BY destination
       ) GROUP BY address ORDER BY volume DESC LIMIT 30`
    ),
    // 11. Top 30 BTC sellers (BTC-quoted trade makers + dispenser operators)
    db.prepare(
      `SELECT address, ROUND(SUM(volume), 8) AS volume, SUM(trades) AS trades FROM (
         SELECT maker AS address, SUM(volume) AS volume, COUNT(*) AS trades
         FROM trades WHERE quote_asset = 'BTC'${includeHidden ? "" : " AND NOT EXISTS (SELECT 1 FROM pair_stats ps WHERE ps.pair = trades.pair AND ps.hidden = 1)"}
         GROUP BY maker
         UNION ALL
         SELECT source AS address, SUM(btc_amount) AS volume, COUNT(*) AS trades
         FROM dispenses${includeHidden ? "" : " WHERE NOT EXISTS (SELECT 1 FROM dispenser_stats ds2 WHERE ds2.asset = dispenses.asset AND ds2.hidden = 1)"}
         GROUP BY source
       ) GROUP BY address ORDER BY volume DESC LIMIT 30`
    ),
  ]);

  // Score trending (same algorithm as /trending)
  const candidates = trendingCandidates.results as {
    pair: string;
    base_asset: string;
    quote_asset: string;
    base_asset_longname: string | null;
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
      timeframe: tf,
      trade_summary: {
        total_volume: trade?.total_volume ?? 0,
        total_trade_count: trade?.total_trade_count ?? 0,
        total_pairs: trade?.total_pairs ?? 0,
        active_pairs: trade?.active_pairs ?? 0,
        tf_volume: trade?.tf_volume ?? 0,
        tf_trades: trade?.tf_trades ?? 0,
        open_orders: trade?.open_orders ?? 0,
      },
      dispense_summary: {
        total_btc_spent: dispense?.total_btc_spent ?? 0,
        total_dispense_count: dispense?.total_dispense_count ?? 0,
        open_dispensers: dispense?.open_dispensers ?? 0,
        tf_volume: dispense?.tf_volume ?? 0,
        tf_dispenses: dispense?.tf_dispenses ?? 0,
      },
      daily_trade_volume: dailyTradeVolume.results,
      daily_dispense_volume: dailyDispenseVolume.results,
      daily_btc_trade_volume: dailyBtcTradeVolume.results,
      top_pairs: topPairs.results,
      top_dispensers: topDispensers.results,
      trending,
      top_makers: topMakersResult.results,
      top_takers: topTakersResult.results,
      top_btc_buyers: topBtcBuyersResult.results,
      top_btc_sellers: topBtcSellersResult.results,
    },
    {
      headers: { "Cache-Control": "public, max-age=300" },
    }
  );
}
