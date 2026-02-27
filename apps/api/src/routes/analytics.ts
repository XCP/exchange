export async function handleAnalytics(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const tfParam = url.searchParams.get("timeframe");
  const tf = tfParam === "7d" || tfParam === "30d" || tfParam === "all" ? tfParam : "24h";
  const includeHidden = url.searchParams.get("include_hidden") === "1";
  const section = url.searchParams.get("section"); // summary | charts | traders (null = all)

  const pairHidden = includeHidden ? "" : " AND hidden = 0";
  const dispHidden = includeHidden ? "" : " AND ds.hidden = 0";

  // Efficient hidden filters for raw tables (NOT IN is faster than correlated NOT EXISTS)
  const tradeHidden = includeHidden ? "" : " AND pair NOT IN (SELECT pair FROM pair_stats WHERE hidden = 1)";
  const dispenseHidden = includeHidden ? "" : " AND asset NOT IN (SELECT asset FROM dispenser_stats WHERE hidden = 1)";

  // Timestamp cutoff for raw trade/dispense queries
  const now = Math.floor(Date.now() / 1000);
  const cutoffMap: Record<string, number> = {
    "24h": now - 86400,
    "7d": now - 604800,
    "30d": now - 2592000,
  };
  const cutoff = cutoffMap[tf] ?? 0; // 0 = no filter (all)
  const timeFilt = cutoff > 0 ? ` AND block_time >= ${cutoff}` : "";

  // Timeframe-aware column names
  const volCol = tf === "all" ? "total_volume" : `volume_${tf}`;
  const tradeCountCol = tf === "all" ? "total_trade_count" : `trade_count_${tf}`;
  const pctCol = tf === "all" ? "0" : `price_change_${tf}`;
  const dispVolCol = tf === "all" ? "total_btc_spent" : `volume_${tf}`;
  const dispCountCol = tf === "all" ? "total_dispense_count" : `dispense_count_${tf}`;
  const dispPctCol = tf === "all" ? "0" : `price_change_${tf}`;

  // Default empty results
  let tradeSummaryData: Record<string, number> | undefined;
  let dispenseSummaryData: Record<string, number> | undefined;
  let dailyTradeVolumeResults: unknown[] = [];
  let dailyDispenseVolumeResults: unknown[] = [];
  let dailyBtcTradeVolumeResults: unknown[] = [];
  let topPairsResults: unknown[] = [];
  let topDispensersResults: unknown[] = [];
  let topMakersResults: unknown[] = [];
  let topTakersResults: unknown[] = [];
  let topBtcBuyersResults: unknown[] = [];
  let topBtcSellersResults: unknown[] = [];

  // Section: summary — counter cards + leaderboards (all from pre-computed stats tables, fast)
  if (!section || section === "summary") {
    const [
      tradeSummary,
      dispenseSummary,
      topPairs,
      topDispensers,
    ] = await db.batch([
      db.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN quote_asset = 'XCP' THEN total_volume ELSE 0 END), 0) AS total_volume,
          COALESCE(SUM(total_trade_count), 0) AS total_trade_count,
          COUNT(*) AS total_pairs,
          SUM(CASE WHEN ${tradeCountCol} > 0 THEN 1 ELSE 0 END) AS active_pairs,
          COALESCE(SUM(CASE WHEN quote_asset = 'XCP' THEN ${volCol} ELSE 0 END), 0) AS tf_volume,
          COALESCE(SUM(${tradeCountCol}), 0) AS tf_trades,
          (SELECT COUNT(*) FROM orders WHERE status = 'open') AS open_orders,
          (SELECT COUNT(*) FROM orders WHERE 1=1${timeFilt}) AS tf_orders
         FROM pair_stats
         WHERE 1=1${pairHidden}`
      ),
      db.prepare(
        `SELECT
          COALESCE(SUM(total_btc_spent), 0) AS total_btc_spent,
          COALESCE(SUM(total_dispense_count), 0) AS total_dispense_count,
          (SELECT COUNT(*) FROM dispensers WHERE status < 10) AS open_dispensers,
          COALESCE(SUM(${dispVolCol}), 0) AS tf_volume,
          COALESCE(SUM(${dispCountCol}), 0) AS tf_dispenses,
          SUM(CASE WHEN ${dispCountCol} > 0 THEN 1 ELSE 0 END) AS active_assets,
          COUNT(*) AS total_assets,
          (SELECT COUNT(*) FROM dispensers WHERE 1=1${timeFilt}) AS tf_dispensers_created
         FROM dispenser_stats ds
         WHERE 1=1${dispHidden}`
      ),
      db.prepare(
        `SELECT pair, base_asset, quote_asset, base_asset_longname, last_price,
                ${tradeCountCol} AS trade_count,
                ${pctCol} AS price_change
         FROM pair_stats
         WHERE ${tradeCountCol} > 0${pairHidden}
         ORDER BY ${tradeCountCol} DESC
         LIMIT 10`
      ),
      db.prepare(
        `SELECT ds.asset, ds.asset_longname,
                ds.${dispVolCol} AS volume, ds.${dispCountCol} AS dispense_count,
                ds.last_dispense_price, ${tf === "all" ? "0" : `ds.${dispPctCol}`} AS price_change,
                ds.active_dispensers
         FROM dispenser_stats ds
         WHERE ds.${dispVolCol} > 0${dispHidden}
         ORDER BY ds.${dispVolCol} DESC
         LIMIT 10`
      ),
    ]);

    tradeSummaryData = tradeSummary.results[0] as Record<string, number> | undefined;
    dispenseSummaryData = dispenseSummary.results[0] as Record<string, number> | undefined;
    topPairsResults = topPairs.results;
    topDispensersResults = topDispensers.results;
  }

  // Section: charts — volume timeseries from raw tables
  if (!section || section === "charts") {
    const [dailyTradeVolume, dailyDispenseVolume, dailyBtcTradeVolume] = await db.batch([
      db.prepare(
        `SELECT (block_time / 86400) * 86400 AS timestamp,
                ROUND(SUM(volume), 2) AS volume,
                COUNT(*) AS trades
         FROM trades
         WHERE quote_asset = 'XCP'${timeFilt}${tradeHidden}
         GROUP BY 1
         ORDER BY 1`
      ),
      db.prepare(
        `SELECT (block_time / 86400) * 86400 AS timestamp,
                SUM(btc_amount) AS volume,
                COUNT(*) AS dispenses
         FROM dispenses
         WHERE 1=1${timeFilt}${dispenseHidden}
         GROUP BY 1
         ORDER BY 1`
      ),
      db.prepare(
        `SELECT (block_time / 86400) * 86400 AS timestamp,
                ROUND(SUM(volume), 8) AS volume,
                COUNT(*) AS trades
         FROM trades
         WHERE quote_asset = 'BTC'${timeFilt}${tradeHidden}
         GROUP BY 1
         ORDER BY 1`
      ),
    ]);

    dailyTradeVolumeResults = dailyTradeVolume.results;
    dailyDispenseVolumeResults = dailyDispenseVolume.results;
    dailyBtcTradeVolumeResults = dailyBtcTradeVolume.results;
  }

  // Section: traders — top trader GROUP BY queries from raw tables
  if (!section || section === "traders") {
    const [topMakers, topTakers, topBtcBuyers, topBtcSellers] = await db.batch([
      db.prepare(
        `SELECT maker AS address, ROUND(SUM(volume), 2) AS volume, COUNT(*) AS trades
         FROM trades
         WHERE quote_asset = 'XCP'${timeFilt}${tradeHidden}
         GROUP BY maker ORDER BY volume DESC LIMIT 30`
      ),
      db.prepare(
        `SELECT taker AS address, ROUND(SUM(volume), 2) AS volume, COUNT(*) AS trades
         FROM trades
         WHERE quote_asset = 'XCP'${timeFilt}${tradeHidden}
         GROUP BY taker ORDER BY volume DESC LIMIT 30`
      ),
      db.prepare(
        `SELECT address, ROUND(SUM(volume), 8) AS volume, SUM(trades) AS trades FROM (
           SELECT taker AS address, SUM(volume) AS volume, COUNT(*) AS trades
           FROM trades WHERE quote_asset = 'BTC'${timeFilt}${tradeHidden}
           GROUP BY taker
           UNION ALL
           SELECT destination AS address, SUM(btc_amount) AS volume, COUNT(*) AS trades
           FROM dispenses WHERE 1=1${timeFilt}${dispenseHidden}
           GROUP BY destination
         ) GROUP BY address ORDER BY volume DESC LIMIT 30`
      ),
      db.prepare(
        `SELECT address, ROUND(SUM(volume), 8) AS volume, SUM(trades) AS trades FROM (
           SELECT maker AS address, SUM(volume) AS volume, COUNT(*) AS trades
           FROM trades WHERE quote_asset = 'BTC'${timeFilt}${tradeHidden}
           GROUP BY maker
           UNION ALL
           SELECT source AS address, SUM(btc_amount) AS volume, COUNT(*) AS trades
           FROM dispenses WHERE 1=1${timeFilt}${dispenseHidden}
           GROUP BY source
         ) GROUP BY address ORDER BY volume DESC LIMIT 30`
      ),
    ]);

    topMakersResults = topMakers.results;
    topTakersResults = topTakers.results;
    topBtcBuyersResults = topBtcBuyers.results;
    topBtcSellersResults = topBtcSellers.results;
  }

  return Response.json(
    {
      timeframe: tf,
      trade_summary: {
        total_volume: tradeSummaryData?.total_volume ?? 0,
        total_trade_count: tradeSummaryData?.total_trade_count ?? 0,
        total_pairs: tradeSummaryData?.total_pairs ?? 0,
        active_pairs: tradeSummaryData?.active_pairs ?? 0,
        tf_volume: tradeSummaryData?.tf_volume ?? 0,
        tf_trades: tradeSummaryData?.tf_trades ?? 0,
        open_orders: tradeSummaryData?.open_orders ?? 0,
        tf_orders: tradeSummaryData?.tf_orders ?? 0,
      },
      dispense_summary: {
        total_btc_spent: dispenseSummaryData?.total_btc_spent ?? 0,
        total_dispense_count: dispenseSummaryData?.total_dispense_count ?? 0,
        open_dispensers: dispenseSummaryData?.open_dispensers ?? 0,
        tf_volume: dispenseSummaryData?.tf_volume ?? 0,
        tf_dispenses: dispenseSummaryData?.tf_dispenses ?? 0,
        active_assets: dispenseSummaryData?.active_assets ?? 0,
        total_assets: dispenseSummaryData?.total_assets ?? 0,
        tf_dispensers_created: dispenseSummaryData?.tf_dispensers_created ?? 0,
      },
      daily_trade_volume: dailyTradeVolumeResults,
      daily_dispense_volume: dailyDispenseVolumeResults,
      daily_btc_trade_volume: dailyBtcTradeVolumeResults,
      top_pairs: topPairsResults,
      top_dispensers: topDispensersResults,
      top_makers: topMakersResults,
      top_takers: topTakersResults,
      top_btc_buyers: topBtcBuyersResults,
      top_btc_sellers: topBtcSellersResults,
    },
    {
      headers: { "Cache-Control": "public, max-age=300" },
    }
  );
}
