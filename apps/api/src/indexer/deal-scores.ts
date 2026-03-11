/**
 * Populates the deal_scores table with pre-computed flip opportunity scores.
 * Called periodically (every 6 hours alongside pair_stats refresh).
 *
 * Strategy:
 * 1. Read all candidate pairs from pair_stats (XCP/PEPECASH quoted, 5+ trades, not hidden)
 * 2. For each candidate, compute fair value from last 10 trades (median)
 * 3. Find cheapest open listing (order or dispenser)
 * 4. Score based on trade frequency, recency, discount, exit liquidity
 * 5. UPSERT into deal_scores table
 *
 * Processes in batches of 50 to stay within D1 query budgets.
 */

const EXCLUDED_ASSETS_SQL = "'XCP','PEPECASH','BITCORN','BTC'";
const BATCH_SIZE = 50;

interface CandidateRow {
  pair: string;
  base_asset: string;
  quote_asset: string;
  base_asset_longname: string | null;
  last_price: number | null;
  last_trade_time: number | null;
  total_trade_count: number;
  all_time_high: number | null;
  all_time_low: number | null;
  first_trade_time: number | null;
  unique_traders: number;
  bid_count: number;
}

interface TradeRow {
  base_asset: string;
  quote_asset: string;
  price: number;
  amount: number;
  block_time: number;
  side: string;
}

interface OrderRow {
  base_asset: string;
  quote_asset: string;
  price: number;
  give_remaining: number;
}

interface TagRow {
  asset: string;
  slug: string;
  name: string;
}

interface DispStatsRow {
  asset: string;
  last_dispense_price: number | null;
  active_dispensers: number;
  unique_buyers: number;
  cheapest_price: number | null;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function refreshDealScores(db: D1Database): Promise<{ processed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Step 1: Get all candidate pairs
  const allCandidates = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, base_asset_longname,
              last_price, last_trade_time, total_trade_count,
              all_time_high, all_time_low, first_trade_time,
              unique_traders, bid_count
       FROM pair_stats
       WHERE hidden = 0
         AND total_trade_count >= 5
         AND base_asset NOT IN (${EXCLUDED_ASSETS_SQL})
         AND quote_asset IN ('XCP', 'PEPECASH')
       ORDER BY total_trade_count DESC
       LIMIT 500`,
    )
    .all<CandidateRow>();

  const candidates = allCandidates.results;
  if (candidates.length === 0) return { processed: 0 };

  // Get all tags once (small table)
  const allTags = await db
    .prepare(
      `SELECT ta.asset, t.slug, t.name
       FROM tag_assets ta
       JOIN tags t ON t.id = ta.tag_id
       WHERE t.tag_type = 'collection'`,
    )
    .all<TagRow>();

  const tagsByAsset = new Map<string, { slug: string; name: string }[]>();
  for (const t of allTags.results) {
    const arr = tagsByAsset.get(t.asset) ?? [];
    arr.push({ slug: t.slug, name: t.name });
    tagsByAsset.set(t.asset, arr);
  }

  // Get dispenser stats once (small table)
  const allDispStats = await db
    .prepare(
      `SELECT ds.asset, ds.last_dispense_price, ds.active_dispensers, ds.unique_buyers,
              (SELECT MIN(d.price) FROM dispensers d
               WHERE d.asset = ds.asset AND d.status < 10 AND d.price > 0 AND d.give_remaining > 0) AS cheapest_price
       FROM dispenser_stats ds`,
    )
    .all<DispStatsRow>();

  const dispByAsset = new Map<string, DispStatsRow>();
  for (const d of allDispStats.results) {
    dispByAsset.set(d.asset, d);
  }

  // Process in batches
  let totalProcessed = 0;

  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE);
    const pairs = batch.map((c) => c.pair);
    const n = pairs.length;
    const ph = pairs.map((_, i) => `?${i + 1}`).join(",");

    // Get recent trades for this batch (last 10 per pair)
    const tradesResult = await db
      .prepare(
        `SELECT base_asset, quote_asset, price, amount, block_time, side
         FROM (
           SELECT base_asset, quote_asset, price, amount, block_time, side,
                  ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
           FROM trades
           WHERE pair IN (${ph})
         )
         WHERE rn <= 10`,
      )
      .bind(...pairs)
      .all<TradeRow>();

    // Get cheapest open sell orders for this batch
    const ordersResult = await db
      .prepare(
        `SELECT base_asset, quote_asset, price, give_remaining
         FROM (
           SELECT base_asset, quote_asset, price, give_remaining,
                  ROW_NUMBER() OVER (PARTITION BY pair ORDER BY price ASC) as rn
           FROM orders
           WHERE pair IN (${ph})
             AND status = 'open'
             AND side = 'ask'
             AND give_remaining > 0
         )
         WHERE rn = 1`,
      )
      .bind(...pairs)
      .all<OrderRow>();

    // Group trades by pair
    const tradesByPair = new Map<string, TradeRow[]>();
    for (const t of tradesResult.results) {
      const key = `${t.base_asset}_${t.quote_asset}`;
      const arr = tradesByPair.get(key) ?? [];
      arr.push(t);
      tradesByPair.set(key, arr);
    }

    // Cheapest order by pair
    const cheapOrderByPair = new Map<string, OrderRow>();
    for (const o of ordersResult.results) {
      const key = `${o.base_asset}_${o.quote_asset}`;
      if (!cheapOrderByPair.has(key)) cheapOrderByPair.set(key, o);
    }

    // Compute scores and build upsert statements
    const upserts: D1PreparedStatement[] = [];

    for (const c of batch) {
      const pairKey = `${c.base_asset}_${c.quote_asset}`;
      const trades = tradesByPair.get(pairKey) ?? [];
      if (trades.length === 0) continue;

      const prices = trades.map((t) => t.price);
      const medianPrice = median(prices);
      if (medianPrice === null || medianPrice <= 0) continue;

      const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
      const lastPrice = c.last_price ?? trades[0].price;

      const recentSales = trades.slice(0, 5).map((t) => ({
        price: t.price,
        amount: t.amount,
        date: t.block_time,
        side: t.side,
      }));

      const firstTradeTs = c.first_trade_time ?? now;
      const daysSinceFirst = Math.max((now - firstTradeTs) / 86400, 1);
      const avgDaysBetweenTrades =
        c.total_trade_count > 1 ? daysSinceFirst / c.total_trade_count : daysSinceFirst;
      const lastTradeDaysAgo = c.last_trade_time
        ? (now - c.last_trade_time) / 86400
        : daysSinceFirst;

      const requiredEdgePct = Math.min(10 + avgDaysBetweenTrades * 1, 50);

      const cheapOrder = cheapOrderByPair.get(pairKey);
      let cheapestPrice: number | null = null;
      let cheapestType: string | null = null;
      let cheapestQty: number | null = null;
      if (cheapOrder) {
        cheapestPrice = cheapOrder.price;
        cheapestType = "order";
        cheapestQty = cheapOrder.give_remaining;
      }

      let discountPct: number | null = null;
      if (cheapestPrice !== null && medianPrice > 0) {
        discountPct = Math.round(((medianPrice - cheapestPrice) / medianPrice) * 100);
      }

      const dStats = dispByAsset.get(c.base_asset);

      // Score
      let score = 0;
      score += Math.min(30, (1 / Math.max(avgDaysBetweenTrades, 0.1)) * 10);
      score += Math.max(0, 20 - lastTradeDaysAgo * 0.5);
      if (discountPct !== null && discountPct > 0) {
        score += Math.min(30, discountPct * 0.6);
      }
      score += Math.min(20, c.bid_count * 5 + (dStats?.unique_buyers ?? 0) * 0.5);
      score = Math.round(score);

      const collections = tagsByAsset.get(c.base_asset) ?? [];

      upserts.push(
        db
          .prepare(
            `INSERT INTO deal_scores (
               asset, quote, asset_longname,
               fair_value, fair_value_method, last_price, highest_price, lowest_price,
               average_price, median_price, recent_sales_json,
               cheapest_listing_price, cheapest_listing_type, cheapest_listing_qty, discount_pct,
               dispenser_cheapest_btc, dispenser_last_price_btc, dispenser_active, dispenser_unique_buyers,
               total_trades, avg_days_between_trades, last_trade_days_ago,
               active_buy_orders, unique_traders,
               score, required_edge_pct, collections_json, updated_at
             ) VALUES (?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?, ?,?,?,?)
             ON CONFLICT (asset, quote) DO UPDATE SET
               asset_longname = excluded.asset_longname,
               fair_value = excluded.fair_value,
               fair_value_method = excluded.fair_value_method,
               last_price = excluded.last_price,
               highest_price = excluded.highest_price,
               lowest_price = excluded.lowest_price,
               average_price = excluded.average_price,
               median_price = excluded.median_price,
               recent_sales_json = excluded.recent_sales_json,
               cheapest_listing_price = excluded.cheapest_listing_price,
               cheapest_listing_type = excluded.cheapest_listing_type,
               cheapest_listing_qty = excluded.cheapest_listing_qty,
               discount_pct = excluded.discount_pct,
               dispenser_cheapest_btc = excluded.dispenser_cheapest_btc,
               dispenser_last_price_btc = excluded.dispenser_last_price_btc,
               dispenser_active = excluded.dispenser_active,
               dispenser_unique_buyers = excluded.dispenser_unique_buyers,
               total_trades = excluded.total_trades,
               avg_days_between_trades = excluded.avg_days_between_trades,
               last_trade_days_ago = excluded.last_trade_days_ago,
               active_buy_orders = excluded.active_buy_orders,
               unique_traders = excluded.unique_traders,
               score = excluded.score,
               required_edge_pct = excluded.required_edge_pct,
               collections_json = excluded.collections_json,
               updated_at = excluded.updated_at`,
          )
          .bind(
            c.base_asset, c.quote_asset, c.base_asset_longname,
            medianPrice, `median_${prices.length}`, lastPrice, c.all_time_high, c.all_time_low,
            Math.round(avgPrice * 1e8) / 1e8, medianPrice, JSON.stringify(recentSales),
            cheapestPrice, cheapestType, cheapestQty, discountPct,
            dStats?.cheapest_price ?? null, dStats?.last_dispense_price ?? null,
            dStats?.active_dispensers ?? 0, dStats?.unique_buyers ?? 0,
            c.total_trade_count, Math.round(avgDaysBetweenTrades * 10) / 10,
            Math.round(lastTradeDaysAgo * 10) / 10,
            c.bid_count, c.unique_traders,
            score, Math.round(requiredEdgePct), JSON.stringify(collections), now,
          ),
      );

      totalProcessed++;
    }

    // Execute upserts in batch
    if (upserts.length > 0) {
      await db.batch(upserts);
    }
  }

  return { processed: totalProcessed };
}
