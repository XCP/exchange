import { cacheControl } from "../utils/cache";

interface PairCandidate {
  pair: string;
  base_asset: string;
  quote_asset: string;
  base_asset_longname: string | null;
  last_price: number | null;
  last_trade_time: number | null;
  volume_24h: number;
  volume_7d: number;
  volume_30d: number;
  total_volume: number;
  trade_count_24h: number;
  trade_count_7d: number;
  trade_count_30d: number;
  total_trade_count: number;
  high_30d: number | null;
  low_30d: number | null;
  all_time_high: number | null;
  all_time_low: number | null;
  first_trade_time: number | null;
  unique_traders: number;
  best_bid: number | null;
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

interface CheapOrder {
  base_asset: string;
  quote_asset: string;
  price: number;
  amount: number;
  give_remaining: number;
  source: string;
}

interface CheapDispenser {
  asset: string;
  price: number;
  give_remaining: number;
  source: string;
  satoshi_price: number;
}

interface TagRow {
  asset: string;
  slug: string;
  name: string;
}

interface DispenserStatsRow {
  asset: string;
  last_dispense_price: number | null;
  total_dispense_count: number;
  active_dispensers: number;
  cheapest_price: number | null;
  unique_buyers: number;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function handleDeals(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const url = new URL(request.url);
  const quoteFilter = url.searchParams.get("quote"); // XCP, PEPECASH, or null (all)
  const minTrades = Math.max(
    parseInt(url.searchParams.get("min_trades") ?? "5", 10),
    1,
  );
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10),
    200,
  );
  const sortCol = url.searchParams.get("sort") ?? "score";
  const allowedSorts = ["score", "discount_pct", "avg_days_between_trades", "total_trade_count"];
  const sort = allowedSorts.includes(sortCol) ? sortCol : "score";

  // Exclude our own traded assets — we already market-make these
  const EXCLUDED_ASSETS = ["XCP", "PEPECASH", "BITCORN", "BTC"];
  const excludePlaceholders = EXCLUDED_ASSETS.map(() => "?").join(",");

  // Step 1: Get candidate pairs — assets with meaningful trade history
  const quoteClause = quoteFilter
    ? `AND ps.quote_asset = ?`
    : `AND ps.quote_asset IN ('XCP', 'PEPECASH')`;
  const quoteBinds = quoteFilter ? [quoteFilter] : [];

  const candidates = await db
    .prepare(
      `SELECT ps.pair, ps.base_asset, ps.quote_asset, ps.base_asset_longname,
              ps.last_price, ps.last_trade_time,
              ps.volume_24h, ps.volume_7d, ps.volume_30d, ps.total_volume,
              ps.trade_count_24h, ps.trade_count_7d, ps.trade_count_30d, ps.total_trade_count,
              ps.high_30d, ps.low_30d, ps.all_time_high, ps.all_time_low,
              ps.first_trade_time, ps.unique_traders, ps.best_bid, ps.bid_count
       FROM pair_stats ps
       WHERE ps.hidden = 0
         AND ps.total_trade_count >= ?
         AND ps.base_asset NOT IN (${excludePlaceholders})
         ${quoteClause}
       ORDER BY ps.total_trade_count DESC
       LIMIT 500`,
    )
    .bind(minTrades, ...EXCLUDED_ASSETS, ...quoteBinds)
    .all<PairCandidate>();

  if (candidates.results.length === 0) {
    return Response.json(
      { deals: [], total: 0, limit, updated_at: Math.floor(Date.now() / 1000) },
      { headers: { "Cache-Control": cacheControl(url, 120) } },
    );
  }

  // Collect unique base assets for batch queries
  const baseAssets = [...new Set(candidates.results.map((c) => c.base_asset))];
  const assetPlaceholders = baseAssets.map(() => "?").join(",");

  // Step 2: Get last 10 trades per asset (for median/avg price computation)
  // Uses window function to rank trades per (base_asset, quote_asset)
  const recentTrades = await db
    .prepare(
      `SELECT base_asset, quote_asset, price, amount, block_time, side
       FROM (
         SELECT base_asset, quote_asset, price, amount, block_time, side,
                ROW_NUMBER() OVER (PARTITION BY base_asset, quote_asset ORDER BY block_time DESC) as rn
         FROM trades
         WHERE base_asset IN (${assetPlaceholders})
           AND quote_asset IN ('XCP', 'PEPECASH')
       ) ranked
       WHERE rn <= 10`,
    )
    .bind(...baseAssets)
    .all<TradeRow>();

  // Step 3: Get cheapest open sell orders per asset
  const cheapOrders = await db
    .prepare(
      `SELECT o.pair, o.base_asset, o.quote_asset, o.price, o.amount,
              o.give_remaining, o.source
       FROM orders o
       WHERE o.status = 'open'
         AND o.side = 'ask'
         AND o.base_asset IN (${assetPlaceholders})
         AND o.quote_asset IN ('XCP', 'PEPECASH')
         AND o.give_remaining > 0
       ORDER BY o.base_asset, o.quote_asset, o.price ASC`,
    )
    .bind(...baseAssets)
    .all<CheapOrder>();

  // Step 4: Get cheapest active dispensers per asset (BTC-priced)
  const cheapDispensers = await db
    .prepare(
      `SELECT d.asset, d.price, d.give_remaining, d.source, d.satoshi_price
       FROM dispensers d
       WHERE d.status < 10
         AND d.give_remaining > 0
         AND d.price > 0
         AND d.asset IN (${assetPlaceholders})
       ORDER BY d.asset, d.price ASC`,
    )
    .bind(...baseAssets)
    .all<CheapDispenser>();

  // Step 5: Get collection tags for these assets
  const tags = await db
    .prepare(
      `SELECT ta.asset, t.slug, t.name
       FROM tag_assets ta
       JOIN tags t ON t.id = ta.tag_id
       WHERE ta.asset IN (${assetPlaceholders})
         AND t.tag_type = 'collection'`,
    )
    .bind(...baseAssets)
    .all<TagRow>();

  // Step 6: Get dispenser stats for context
  const dispenserStats = await db
    .prepare(
      `SELECT ds.asset, ds.last_dispense_price, ds.total_dispense_count,
              ds.active_dispensers, ds.unique_buyers,
              (SELECT MIN(price) FROM dispensers
               WHERE asset = ds.asset AND status < 10 AND price > 0 AND give_remaining > 0) AS cheapest_price
       FROM dispenser_stats ds
       WHERE ds.asset IN (${assetPlaceholders})`,
    )
    .bind(...baseAssets)
    .all<DispenserStatsRow>();

  // --- Aggregate data per asset ---

  // Group recent trades by (base_asset, quote_asset)
  const tradesByPair = new Map<string, TradeRow[]>();
  for (const t of recentTrades.results) {
    const key = `${t.base_asset}_${t.quote_asset}`;
    const arr = tradesByPair.get(key) ?? [];
    arr.push(t);
    tradesByPair.set(key, arr);
  }

  // Group cheapest order per (base_asset, quote_asset) — already sorted by price ASC
  const cheapestOrderByPair = new Map<string, CheapOrder>();
  for (const o of cheapOrders.results) {
    const key = `${o.base_asset}_${o.quote_asset}`;
    if (!cheapestOrderByPair.has(key)) {
      cheapestOrderByPair.set(key, o);
    }
  }

  // Group cheapest dispenser per asset — already sorted by price ASC
  const cheapestDispenserByAsset = new Map<string, CheapDispenser>();
  for (const d of cheapDispensers.results) {
    if (!cheapestDispenserByAsset.has(d.asset)) {
      cheapestDispenserByAsset.set(d.asset, d);
    }
  }

  // Tags by asset
  const tagsByAsset = new Map<string, { slug: string; name: string }[]>();
  for (const t of tags.results) {
    const arr = tagsByAsset.get(t.asset) ?? [];
    arr.push({ slug: t.slug, name: t.name });
    tagsByAsset.set(t.asset, arr);
  }

  // Dispenser stats by asset
  const dispenserStatsByAsset = new Map<string, DispenserStatsRow>();
  for (const d of dispenserStats.results) {
    dispenserStatsByAsset.set(d.asset, d);
  }

  // --- Compute deals ---

  const now = Math.floor(Date.now() / 1000);

  interface Deal {
    asset: string;
    asset_longname: string | null;
    collections: { slug: string; name: string }[];
    quote: string;

    // Price context
    fair_value: number;
    fair_value_method: string;
    last_price: number;
    highest_price: number | null;
    lowest_price: number | null;
    average_price: number;
    median_price: number;
    recent_sales: { price: number; amount: number; date: number; side: string }[];

    // Current opportunity
    cheapest_listing_price: number | null;
    cheapest_listing_type: "order" | "dispenser" | null;
    cheapest_listing_qty: number | null;
    discount_pct: number | null;

    // Dispenser context (BTC-priced, separate from quote-pair pricing)
    dispenser_cheapest_btc: number | null;
    dispenser_last_price_btc: number | null;
    dispenser_active: number;
    dispenser_unique_buyers: number;

    // Liquidity & frequency
    total_trades: number;
    avg_days_between_trades: number;
    last_trade_days_ago: number;
    active_buy_orders: number;
    unique_traders: number;

    // Scoring
    score: number;
    required_edge_pct: number;
  }

  const deals: Deal[] = [];

  for (const c of candidates.results) {
    const pairKey = `${c.base_asset}_${c.quote_asset}`;
    const trades = tradesByPair.get(pairKey) ?? [];
    if (trades.length === 0) continue;

    const prices = trades.map((t) => t.price);
    const medianPrice = median(prices);
    if (medianPrice === null || medianPrice <= 0) continue;

    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const lastPrice = c.last_price ?? trades[0].price;

    // Fair value: median of recent trades (robust to outliers)
    const fairValue = medianPrice;

    // Recent sales for display (last 5)
    const recentSales = trades.slice(0, 5).map((t) => ({
      price: t.price,
      amount: t.amount,
      date: t.block_time,
      side: t.side,
    }));

    // Trade frequency
    const firstTradeTs = c.first_trade_time ?? now;
    const daysSinceFirst = Math.max((now - firstTradeTs) / 86400, 1);
    const avgDaysBetweenTrades =
      c.total_trade_count > 1 ? daysSinceFirst / c.total_trade_count : daysSinceFirst;
    const lastTradeDaysAgo = c.last_trade_time
      ? (now - c.last_trade_time) / 86400
      : daysSinceFirst;

    // Required edge: base 10% + 1% per avg day between trades, capped at 50%
    const requiredEdgePct = Math.min(10 + avgDaysBetweenTrades * 1, 50);

    // Current cheapest listing (order)
    const cheapOrder = cheapestOrderByPair.get(pairKey);
    let cheapestPrice: number | null = null;
    let cheapestType: "order" | "dispenser" | null = null;
    let cheapestQty: number | null = null;

    if (cheapOrder) {
      cheapestPrice = cheapOrder.price;
      cheapestType = "order";
      cheapestQty = cheapOrder.give_remaining;
    }

    // Discount from fair value
    let discountPct: number | null = null;
    if (cheapestPrice !== null && fairValue > 0) {
      discountPct = Math.round(((fairValue - cheapestPrice) / fairValue) * 100);
    }

    // Dispenser context
    const dStats = dispenserStatsByAsset.get(c.base_asset);
    const cheapDisp = cheapestDispenserByAsset.get(c.base_asset);

    // Score: composite of trade frequency, recency, discount, exit liquidity
    let score = 0;

    // Trade frequency component (0-30 pts): more frequent = better
    const freqScore = Math.min(30, (1 / Math.max(avgDaysBetweenTrades, 0.1)) * 10);
    score += freqScore;

    // Recency component (0-20 pts): recent trade = better
    const recencyScore = Math.max(0, 20 - lastTradeDaysAgo * 0.5);
    score += recencyScore;

    // Discount component (0-30 pts): bigger discount from fair value = better
    if (discountPct !== null && discountPct > 0) {
      score += Math.min(30, discountPct * 0.6);
    }

    // Exit liquidity component (0-20 pts): buy orders + dispenser buyers = exit confidence
    const exitScore = Math.min(
      20,
      c.bid_count * 5 + (dStats?.unique_buyers ?? 0) * 0.5,
    );
    score += exitScore;

    score = Math.round(score);

    deals.push({
      asset: c.base_asset,
      asset_longname: c.base_asset_longname,
      collections: tagsByAsset.get(c.base_asset) ?? [],
      quote: c.quote_asset,
      fair_value: fairValue,
      fair_value_method: `median_${prices.length}`,
      last_price: lastPrice,
      highest_price: c.all_time_high,
      lowest_price: c.all_time_low,
      average_price: Math.round(avgPrice * 1e8) / 1e8,
      median_price: medianPrice,
      recent_sales: recentSales,
      cheapest_listing_price: cheapestPrice,
      cheapest_listing_type: cheapestType,
      cheapest_listing_qty: cheapestQty,
      discount_pct: discountPct,
      dispenser_cheapest_btc: cheapDisp?.price ?? null,
      dispenser_last_price_btc: dStats?.last_dispense_price ?? null,
      dispenser_active: dStats?.active_dispensers ?? 0,
      dispenser_unique_buyers: dStats?.unique_buyers ?? 0,
      total_trades: c.total_trade_count,
      avg_days_between_trades: Math.round(avgDaysBetweenTrades * 10) / 10,
      last_trade_days_ago: Math.round(lastTradeDaysAgo * 10) / 10,
      active_buy_orders: c.bid_count,
      unique_traders: c.unique_traders,
      score,
      required_edge_pct: Math.round(requiredEdgePct),
    });
  }

  // Deduplicate: same asset may appear in both XCP and PEPECASH pairs.
  // Keep the one with the better score (or the one with an active deal).
  const bestByAsset = new Map<string, Deal>();
  for (const d of deals) {
    const existing = bestByAsset.get(d.asset);
    if (!existing || d.score > existing.score) {
      bestByAsset.set(d.asset, d);
    }
  }
  let deduped = [...bestByAsset.values()];

  // Sort
  if (sort === "discount_pct") {
    deduped.sort((a, b) => (b.discount_pct ?? -999) - (a.discount_pct ?? -999));
  } else if (sort === "avg_days_between_trades") {
    deduped.sort((a, b) => a.avg_days_between_trades - b.avg_days_between_trades);
  } else if (sort === "total_trade_count") {
    deduped.sort((a, b) => b.total_trades - a.total_trades);
  } else {
    // Default: score DESC
    deduped.sort((a, b) => b.score - a.score);
  }

  deduped = deduped.slice(0, limit);

  return Response.json(
    {
      deals: deduped,
      total: deduped.length,
      limit,
      updated_at: Math.floor(Date.now() / 1000),
    },
    { headers: { "Cache-Control": cacheControl(url, 120) } },
  );
}
