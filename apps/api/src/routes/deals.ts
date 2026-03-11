import { cacheControl } from "../utils/cache";

interface PairCandidate {
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
  give_remaining: number;
  source: string;
}

interface CheapDispenser {
  asset: string;
  price: number;
  give_remaining: number;
  source: string;
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

// D1 has a ~100 bind variable limit. To avoid it, we use a CTE that
// selects candidate base_assets from pair_stats (no bind vars needed for
// the asset list), and join subsequent queries against that CTE.
// The excluded assets and quote filter are hardcoded into SQL strings
// (safe — they're constants, not user input).

const EXCLUDED_ASSETS = ["XCP", "PEPECASH", "BITCORN", "BTC"];
const EXCLUDED_SQL = EXCLUDED_ASSETS.map((a) => `'${a}'`).join(",");

function candidateCte(minTrades: number, quoteFilter: string | null): { sql: string; binds: unknown[] } {
  const quoteClause = quoteFilter
    ? `AND ps.quote_asset = ?`
    : `AND ps.quote_asset IN ('XCP', 'PEPECASH')`;
  const binds: unknown[] = [minTrades];
  if (quoteFilter) binds.push(quoteFilter);

  const sql = `
    WITH candidates AS (
      SELECT ps.base_asset, ps.quote_asset
      FROM pair_stats ps
      WHERE ps.hidden = 0
        AND ps.total_trade_count >= ?
        AND ps.base_asset NOT IN (${EXCLUDED_SQL})
        ${quoteClause}
      ORDER BY ps.total_trade_count DESC
      LIMIT 500
    )`;

  return { sql, binds };
}

export async function handleDeals(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const url = new URL(request.url);
  const quoteFilter = url.searchParams.get("quote");
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

  const cte = candidateCte(minTrades, quoteFilter);

  // Step 1: Get candidate pairs
  const candidates = await db
    .prepare(
      `${cte.sql}
       SELECT ps.pair, ps.base_asset, ps.quote_asset, ps.base_asset_longname,
              ps.last_price, ps.last_trade_time, ps.total_trade_count,
              ps.all_time_high, ps.all_time_low,
              ps.first_trade_time, ps.unique_traders, ps.best_bid, ps.bid_count
       FROM pair_stats ps
       JOIN candidates c ON c.base_asset = ps.base_asset AND c.quote_asset = ps.quote_asset`,
    )
    .bind(...cte.binds)
    .all<PairCandidate>();

  if (candidates.results.length === 0) {
    return Response.json(
      { deals: [], total: 0, limit, updated_at: Math.floor(Date.now() / 1000) },
      { headers: { "Cache-Control": cacheControl(url, 120) } },
    );
  }

  // Step 2: Get last 10 trades per candidate asset (window function, no bind vars for asset list)
  const recentTrades = await db
    .prepare(
      `${cte.sql}
       SELECT t.base_asset, t.quote_asset, t.price, t.amount, t.block_time, t.side
       FROM (
         SELECT t2.base_asset, t2.quote_asset, t2.price, t2.amount, t2.block_time, t2.side,
                ROW_NUMBER() OVER (PARTITION BY t2.base_asset, t2.quote_asset ORDER BY t2.block_time DESC) as rn
         FROM trades t2
         JOIN candidates c ON c.base_asset = t2.base_asset AND c.quote_asset = t2.quote_asset
       ) t
       WHERE t.rn <= 10`,
    )
    .bind(...cte.binds)
    .all<TradeRow>();

  // Step 3: Get cheapest open sell orders per candidate asset
  const cheapOrders = await db
    .prepare(
      `${cte.sql}
       SELECT o.base_asset, o.quote_asset, o.price, o.give_remaining, o.source
       FROM orders o
       JOIN candidates c ON c.base_asset = o.base_asset AND c.quote_asset = o.quote_asset
       WHERE o.status = 'open'
         AND o.side = 'ask'
         AND o.give_remaining > 0
       ORDER BY o.base_asset, o.quote_asset, o.price ASC`,
    )
    .bind(...cte.binds)
    .all<CheapOrder>();

  // Step 4: Get cheapest active dispensers per candidate asset (BTC-priced)
  const cheapDispensers = await db
    .prepare(
      `${cte.sql}
       SELECT d.asset, d.price, d.give_remaining, d.source
       FROM dispensers d
       WHERE d.status < 10
         AND d.give_remaining > 0
         AND d.price > 0
         AND d.asset IN (SELECT DISTINCT base_asset FROM candidates)
       ORDER BY d.asset, d.price ASC`,
    )
    .bind(...cte.binds)
    .all<CheapDispenser>();

  // Step 5: Get collection tags
  const tags = await db
    .prepare(
      `${cte.sql}
       SELECT ta.asset, t.slug, t.name
       FROM tag_assets ta
       JOIN tags t ON t.id = ta.tag_id
       WHERE ta.asset IN (SELECT DISTINCT base_asset FROM candidates)
         AND t.tag_type = 'collection'`,
    )
    .bind(...cte.binds)
    .all<TagRow>();

  // Step 6: Get dispenser stats
  const dispenserStats = await db
    .prepare(
      `${cte.sql}
       SELECT ds.asset, ds.last_dispense_price, ds.total_dispense_count,
              ds.active_dispensers, ds.unique_buyers,
              (SELECT MIN(price) FROM dispensers
               WHERE asset = ds.asset AND status < 10 AND price > 0 AND give_remaining > 0) AS cheapest_price
       FROM dispenser_stats ds
       WHERE ds.asset IN (SELECT DISTINCT base_asset FROM candidates)`,
    )
    .bind(...cte.binds)
    .all<DispenserStatsRow>();

  // --- Aggregate data per asset ---

  const tradesByPair = new Map<string, TradeRow[]>();
  for (const t of recentTrades.results) {
    const key = `${t.base_asset}_${t.quote_asset}`;
    const arr = tradesByPair.get(key) ?? [];
    arr.push(t);
    tradesByPair.set(key, arr);
  }

  const cheapestOrderByPair = new Map<string, CheapOrder>();
  for (const o of cheapOrders.results) {
    const key = `${o.base_asset}_${o.quote_asset}`;
    if (!cheapestOrderByPair.has(key)) {
      cheapestOrderByPair.set(key, o);
    }
  }

  const cheapestDispenserByAsset = new Map<string, CheapDispenser>();
  for (const d of cheapDispensers.results) {
    if (!cheapestDispenserByAsset.has(d.asset)) {
      cheapestDispenserByAsset.set(d.asset, d);
    }
  }

  const tagsByAsset = new Map<string, { slug: string; name: string }[]>();
  for (const t of tags.results) {
    const arr = tagsByAsset.get(t.asset) ?? [];
    arr.push({ slug: t.slug, name: t.name });
    tagsByAsset.set(t.asset, arr);
  }

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
    fair_value: number;
    fair_value_method: string;
    last_price: number;
    highest_price: number | null;
    lowest_price: number | null;
    average_price: number;
    median_price: number;
    recent_sales: { price: number; amount: number; date: number; side: string }[];
    cheapest_listing_price: number | null;
    cheapest_listing_type: "order" | "dispenser" | null;
    cheapest_listing_qty: number | null;
    discount_pct: number | null;
    dispenser_cheapest_btc: number | null;
    dispenser_last_price_btc: number | null;
    dispenser_active: number;
    dispenser_unique_buyers: number;
    total_trades: number;
    avg_days_between_trades: number;
    last_trade_days_ago: number;
    active_buy_orders: number;
    unique_traders: number;
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

    const fairValue = medianPrice;

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

    const cheapOrder = cheapestOrderByPair.get(pairKey);
    let cheapestPrice: number | null = null;
    let cheapestType: "order" | "dispenser" | null = null;
    let cheapestQty: number | null = null;

    if (cheapOrder) {
      cheapestPrice = cheapOrder.price;
      cheapestType = "order";
      cheapestQty = cheapOrder.give_remaining;
    }

    let discountPct: number | null = null;
    if (cheapestPrice !== null && fairValue > 0) {
      discountPct = Math.round(((fairValue - cheapestPrice) / fairValue) * 100);
    }

    const dStats = dispenserStatsByAsset.get(c.base_asset);
    const cheapDisp = cheapestDispenserByAsset.get(c.base_asset);

    let score = 0;

    const freqScore = Math.min(30, (1 / Math.max(avgDaysBetweenTrades, 0.1)) * 10);
    score += freqScore;

    const recencyScore = Math.max(0, 20 - lastTradeDaysAgo * 0.5);
    score += recencyScore;

    if (discountPct !== null && discountPct > 0) {
      score += Math.min(30, discountPct * 0.6);
    }

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

  // Deduplicate: same asset may appear in both XCP and PEPECASH pairs
  const bestByAsset = new Map<string, Deal>();
  for (const d of deals) {
    const existing = bestByAsset.get(d.asset);
    if (!existing || d.score > existing.score) {
      bestByAsset.set(d.asset, d);
    }
  }
  let deduped = [...bestByAsset.values()];

  if (sort === "discount_pct") {
    deduped.sort((a, b) => (b.discount_pct ?? -999) - (a.discount_pct ?? -999));
  } else if (sort === "avg_days_between_trades") {
    deduped.sort((a, b) => a.avg_days_between_trades - b.avg_days_between_trades);
  } else if (sort === "total_trade_count") {
    deduped.sort((a, b) => b.total_trades - a.total_trades);
  } else {
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
