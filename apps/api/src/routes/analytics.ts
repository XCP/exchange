import { cacheControl } from "../utils/cache";

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

  // For "all" timeframe, SQL returns 0 — overridden by Counterparty API result_count
  const tfOrdersExpr = tf === "all"
    ? "0"
    : `(SELECT COUNT(*) FROM orders WHERE 1=1${timeFilt})`;
  const tfDispCreatedExpr = tf === "all"
    ? "0"
    : `(SELECT COUNT(*) FROM dispensers WHERE 1=1${timeFilt})`;

  // Default empty results
  let tradeSummaryData: Record<string, number> | undefined;
  let dispenseSummaryData: Record<string, number> | undefined;
  let dailyTradeVolumeResults: unknown[] = [];
  let dailyDispenseVolumeResults: unknown[] = [];
  let dailyBtcTradeVolumeResults: unknown[] = [];
  let topPairsResults: unknown[] = [];
  let topDispensersResults: unknown[] = [];
  let quoteVolumeResults: unknown[] = [];
  let topTradedCollResults: unknown[] = [];
  let topDispensedCollResults: unknown[] = [];
  let topMakersResults: unknown[] = [];
  let topTakersResults: unknown[] = [];
  let topBtcBuyersResults: unknown[] = [];
  let topBtcSellersResults: unknown[] = [];

  // Section: summary — counter cards + leaderboards (all from pre-computed stats tables, fast)
  if (!section || section === "summary") {
    const dbPromise = db.batch([
      db.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN quote_asset = 'XCP' THEN total_volume ELSE 0 END), 0) AS total_volume,
          COALESCE(SUM(total_trade_count), 0) AS total_trade_count,
          COUNT(*) AS total_pairs,
          SUM(CASE WHEN ${tradeCountCol} > 0 THEN 1 ELSE 0 END) AS active_pairs,
          COALESCE(SUM(CASE WHEN quote_asset = 'XCP' THEN ${volCol} ELSE 0 END), 0) AS tf_volume,
          COALESCE(SUM(${tradeCountCol}), 0) AS tf_trades,
          (SELECT COUNT(*) FROM orders WHERE status = 'open') AS open_orders,
          ${tfOrdersExpr} AS tf_orders,
          (SELECT COUNT(*) FROM (SELECT maker AS a FROM trades WHERE 1=1${timeFilt}${tradeHidden} UNION SELECT taker FROM trades WHERE 1=1${timeFilt}${tradeHidden})) AS tf_unique_traders,
          ${cutoff > 0 ? `(SELECT COUNT(*) FROM (SELECT pair FROM trades GROUP BY pair HAVING MIN(block_time) >= ${cutoff}))` : "0"} AS new_pairs
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
          ${tfDispCreatedExpr} AS tf_dispensers_created,
          (SELECT COUNT(DISTINCT destination) FROM dispenses WHERE 1=1${timeFilt}${dispenseHidden}) AS tf_unique_buyers,
          ${cutoff > 0 ? `(SELECT COUNT(*) FROM (SELECT asset FROM dispenses GROUP BY asset HAVING MIN(block_time) >= ${cutoff}))` : "0"} AS new_assets
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
      db.prepare(
        `SELECT quote_asset, MAX(quote_asset_longname) AS quote_asset_longname,
                ROUND(SUM(${volCol}), 2) AS volume,
                SUM(${tradeCountCol}) AS trade_count
         FROM pair_stats
         WHERE ${tradeCountCol} > 0 AND quote_asset NOT IN ('XCP', 'BTC')${pairHidden}
         GROUP BY quote_asset
         ORDER BY trade_count DESC`
      ),
      db.prepare(
        `SELECT t.slug, t.name, COALESCE(SUM(ps.${tradeCountCol}), 0) AS trade_count
         FROM tags t
         JOIN tag_assets ta ON t.id = ta.tag_id
         JOIN pair_stats ps ON ta.asset = ps.base_asset
         WHERE t.tag_type = 'collection' AND ps.hidden = 0
         GROUP BY t.id, t.slug, t.name
         HAVING trade_count > 0
         ORDER BY trade_count DESC LIMIT 10`
      ),
      db.prepare(
        `SELECT t.slug, t.name, COALESCE(SUM(ds.${dispVolCol}), 0) AS volume
         FROM tags t
         JOIN tag_assets ta ON t.id = ta.tag_id
         JOIN dispenser_stats ds ON ta.asset = ds.asset
         WHERE t.tag_type = 'collection' AND ds.hidden = 0
         GROUP BY t.id, t.slug, t.name
         HAVING volume > 0
         ORDER BY volume DESC LIMIT 10`
      ),
    ]);

    // For "all" timeframe, fetch true all-time totals from Counterparty API in parallel
    // cf.cacheTtl caches at the Cloudflare edge for 6 hours
    const cpFetchOpts = { cf: { cacheTtl: 21600 } };
    const cpPromise = tf === "all"
      ? Promise.all([
          fetch("https://api.counterparty.io:4000/v2/orders?limit=1", cpFetchOpts).then(r => r.json()).catch(() => null),
          fetch("https://api.counterparty.io:4000/v2/dispensers?limit=1", cpFetchOpts).then(r => r.json()).catch(() => null),
        ])
      : null;

    const [tradeSummary, dispenseSummary, topPairs, topDispensers, quoteVolumes, topTradedColl, topDispensedColl] = await dbPromise;

    tradeSummaryData = tradeSummary.results[0] as Record<string, number> | undefined;
    dispenseSummaryData = dispenseSummary.results[0] as Record<string, number> | undefined;

    if (cpPromise) {
      const [cpOrders, cpDispensers] = await cpPromise as [{ result_count?: number } | null, { result_count?: number } | null];
      if (tradeSummaryData && cpOrders?.result_count != null) {
        tradeSummaryData.tf_orders = cpOrders.result_count;
      }
      if (dispenseSummaryData && cpDispensers?.result_count != null) {
        dispenseSummaryData.tf_dispensers_created = cpDispensers.result_count;
      }
    }

    topPairsResults = topPairs.results;
    topDispensersResults = topDispensers.results;
    quoteVolumeResults = quoteVolumes.results;
    topTradedCollResults = topTradedColl.results;
    topDispensedCollResults = topDispensedColl.results;
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
        tf_unique_traders: tradeSummaryData?.tf_unique_traders ?? 0,
        new_pairs: tradeSummaryData?.new_pairs ?? 0,
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
        tf_unique_buyers: dispenseSummaryData?.tf_unique_buyers ?? 0,
        new_assets: dispenseSummaryData?.new_assets ?? 0,
      },
      daily_trade_volume: dailyTradeVolumeResults,
      daily_dispense_volume: dailyDispenseVolumeResults,
      daily_btc_trade_volume: dailyBtcTradeVolumeResults,
      top_pairs: topPairsResults,
      top_dispensers: topDispensersResults,
      quote_volumes: quoteVolumeResults,
      top_traded_collections: topTradedCollResults,
      top_dispensed_collections: topDispensedCollResults,
      top_makers: topMakersResults,
      top_takers: topTakersResults,
      top_btc_buyers: topBtcBuyersResults,
      top_btc_sellers: topBtcSellersResults,
    },
    {
      headers: { "Cache-Control": cacheControl(url, 3600) },
    }
  );
}
