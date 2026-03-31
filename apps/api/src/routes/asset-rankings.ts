import { cacheControl } from "../utils/cache";

interface RankResult {
  metric: string
  label: string
  value: number
  rank: number
  total: number
  percentile: number
  scope: "global"
  pair?: string
}

export async function handleAssetRankings(
  request: Request,
  db: D1Database,
  asset: string
): Promise<Response> {
  const url = new URL(request.url);
  const upper = asset.toUpperCase();

  const rankings: RankResult[] = [];

  // Dispenser rankings
  const dsRow = await db
    .prepare(`SELECT total_btc_spent, total_dispense_count, unique_buyers FROM dispenser_stats WHERE asset = ?`)
    .bind(upper)
    .first<{ total_btc_spent: number | null; total_dispense_count: number | null; unique_buyers: number | null }>();

  if (dsRow) {
    const dsTotal = (await db.prepare(`SELECT COUNT(*) as c FROM dispenser_stats WHERE total_dispense_count > 0`).first<{ c: number }>())?.c ?? 0;

    if (dsRow.total_btc_spent != null && dsRow.total_btc_spent > 0) {
      const rank = (await db.prepare(`SELECT COUNT(*) as c FROM dispenser_stats WHERE total_btc_spent > ?`).bind(dsRow.total_btc_spent).first<{ c: number }>())?.c ?? 0;
      rankings.push({
        metric: "btc_spent", label: "BTC Volume", value: dsRow.total_btc_spent,
        rank: rank + 1, total: dsTotal, percentile: dsTotal > 0 ? ((dsTotal - rank) / dsTotal) * 100 : 0, scope: "global",
      });
    }

    if (dsRow.total_dispense_count != null && dsRow.total_dispense_count > 0) {
      const rank = (await db.prepare(`SELECT COUNT(*) as c FROM dispenser_stats WHERE total_dispense_count > ?`).bind(dsRow.total_dispense_count).first<{ c: number }>())?.c ?? 0;
      rankings.push({
        metric: "dispense_count", label: "Dispenses", value: dsRow.total_dispense_count,
        rank: rank + 1, total: dsTotal, percentile: dsTotal > 0 ? ((dsTotal - rank) / dsTotal) * 100 : 0, scope: "global",
      });
    }

    if (dsRow.unique_buyers != null && dsRow.unique_buyers > 0) {
      const rank = (await db.prepare(`SELECT COUNT(*) as c FROM dispenser_stats WHERE unique_buyers > ?`).bind(dsRow.unique_buyers).first<{ c: number }>())?.c ?? 0;
      rankings.push({
        metric: "unique_buyers", label: "Unique Buyers", value: dsRow.unique_buyers,
        rank: rank + 1, total: dsTotal, percentile: dsTotal > 0 ? ((dsTotal - rank) / dsTotal) * 100 : 0, scope: "global",
      });
    }
  }

  // DEX trading rankings — best pair by total_trade_count
  const bestPair = await db
    .prepare(`SELECT pair, total_trade_count, unique_traders FROM pair_stats WHERE (base_asset = ? OR quote_asset = ?) AND total_trade_count > 0 ORDER BY total_trade_count DESC LIMIT 1`)
    .bind(upper, upper)
    .first<{ pair: string; total_trade_count: number; unique_traders: number }>();

  if (bestPair) {
    const psTotal = (await db.prepare(`SELECT COUNT(*) as c FROM pair_stats WHERE total_trade_count > 0`).first<{ c: number }>())?.c ?? 0;

    if (bestPair.total_trade_count > 0) {
      const rank = (await db.prepare(`SELECT COUNT(*) as c FROM pair_stats WHERE total_trade_count > ?`).bind(bestPair.total_trade_count).first<{ c: number }>())?.c ?? 0;
      rankings.push({
        metric: "dex_trades", label: "DEX Trades", value: bestPair.total_trade_count,
        rank: rank + 1, total: psTotal, percentile: psTotal > 0 ? ((psTotal - rank) / psTotal) * 100 : 0, scope: "global", pair: bestPair.pair,
      });
    }

    if (bestPair.unique_traders > 0) {
      const rank = (await db.prepare(`SELECT COUNT(*) as c FROM pair_stats WHERE unique_traders > ?`).bind(bestPair.unique_traders).first<{ c: number }>())?.c ?? 0;
      rankings.push({
        metric: "dex_traders", label: "Unique Traders", value: bestPair.unique_traders,
        rank: rank + 1, total: psTotal, percentile: psTotal > 0 ? ((psTotal - rank) / psTotal) * 100 : 0, scope: "global", pair: bestPair.pair,
      });
    }
  }

  // Aggregated DEX stats across all pairs where this asset appears
  const dexAgg = await db
    .prepare(`SELECT
      SUM(total_trade_count) as total_trades,
      SUM(total_volume) as total_volume,
      SUM(open_orders) as open_orders,
      COUNT(*) as pair_count,
      SUM(CASE WHEN total_trade_count > 0 THEN 1 ELSE 0 END) as active_pairs,
      SUM(unique_traders) as unique_traders
    FROM pair_stats WHERE base_asset = ? OR quote_asset = ?`)
    .bind(upper, upper)
    .first<{ total_trades: number; total_volume: number; open_orders: number; pair_count: number; active_pairs: number; unique_traders: number }>();

  // Quote pair count (ecosystem role)
  const quotePairCount = (await db.prepare(`SELECT COUNT(*) as c FROM pair_stats WHERE quote_asset = ? AND total_trade_count > 0`).bind(upper).first<{ c: number }>())?.c ?? 0;

  // Collection info
  const collectionRow = await db
    .prepare(`SELECT t.slug, t.name, t.assets_count FROM tag_assets ta JOIN tags t ON ta.tag_id = t.id AND t.tag_type = 'collection' WHERE ta.asset = ? LIMIT 1`)
    .bind(upper)
    .first<{ slug: string; name: string; assets_count: number }>();

  return Response.json(
    {
      asset: upper,
      rankings: rankings.sort((a, b) => a.rank - b.rank),
      dex: dexAgg ? {
        total_trades: dexAgg.total_trades ?? 0,
        total_volume: dexAgg.total_volume ?? 0,
        open_orders: dexAgg.open_orders ?? 0,
        pair_count: dexAgg.pair_count ?? 0,
        active_pairs: dexAgg.active_pairs ?? 0,
        unique_traders: dexAgg.unique_traders ?? 0,
      } : null,
      quote_pair_count: quotePairCount,
      collection: collectionRow ? { slug: collectionRow.slug, name: collectionRow.name, total_assets: collectionRow.assets_count } : null,
    },
    { headers: { "Cache-Control": cacheControl(url, 300) } }
  );
}
