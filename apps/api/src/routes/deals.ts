import { cacheControl } from "../utils/cache";

interface DealRow {
  listing_id: string;
  listing_type: string;
  asset: string;
  quote: string;
  asset_longname: string | null;
  listing_price: number;
  listing_qty: number | null;
  listing_source: string | null;
  listing_block_time: number | null;
  fair_value: number | null;
  fair_value_method: string | null;
  discount_pct: number | null;
  last_price: number | null;
  highest_price: number | null;
  lowest_price: number | null;
  average_price: number | null;
  median_price: number | null;
  recent_sales_json: string | null;
  total_trades: number;
  avg_days_between_trades: number | null;
  last_trade_days_ago: number | null;
  unique_traders: number;
  active_buy_orders: number;
  dispenser_cheapest_btc: number | null;
  dispenser_active: number;
  dispenser_unique_buyers: number;
  score: number;
  required_edge_pct: number;
  collections_json: string | null;
  updated_at: number | null;
}

export async function handleDeals(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const url = new URL(request.url);
  const quoteFilter = url.searchParams.get("quote");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10),
    500,
  );
  const sortCol = url.searchParams.get("sort") ?? "score";
  const allowedSorts: Record<string, string> = {
    score: "score DESC",
    discount_pct: "discount_pct DESC",
    avg_days_between_trades: "avg_days_between_trades ASC",
    total_trade_count: "total_trades DESC",
    listing_price: "listing_price ASC",
  };
  const orderBy = allowedSorts[sortCol] ?? "score DESC";

  const quoteClause = quoteFilter ? "AND quote = ?" : "";

  const result = await db
    .prepare(
      `SELECT * FROM deal_scores
       WHERE fair_value IS NOT NULL AND fair_value > 0
       ${quoteClause}
       ORDER BY ${orderBy}
       LIMIT ?`,
    )
    .bind(...(quoteFilter ? [quoteFilter, limit] : [limit]))
    .all<DealRow>();

  const deals = result.results.map((r) => ({
    listing_id: r.listing_id,
    listing_type: r.listing_type,
    asset: r.asset,
    asset_longname: r.asset_longname,
    collections: r.collections_json ? JSON.parse(r.collections_json) : [],
    quote: r.quote,
    listing_price: r.listing_price,
    listing_qty: r.listing_qty,
    listing_source: r.listing_source,
    listing_block_time: r.listing_block_time,
    fair_value: r.fair_value,
    fair_value_method: r.fair_value_method,
    discount_pct: r.discount_pct,
    last_price: r.last_price,
    highest_price: r.highest_price,
    lowest_price: r.lowest_price,
    average_price: r.average_price,
    median_price: r.median_price,
    recent_sales: r.recent_sales_json ? JSON.parse(r.recent_sales_json) : [],
    dispenser_cheapest_btc: r.dispenser_cheapest_btc,
    dispenser_active: r.dispenser_active,
    dispenser_unique_buyers: r.dispenser_unique_buyers,
    total_trades: r.total_trades,
    avg_days_between_trades: r.avg_days_between_trades,
    last_trade_days_ago: r.last_trade_days_ago,
    active_buy_orders: r.active_buy_orders,
    unique_traders: r.unique_traders,
    score: r.score,
    required_edge_pct: r.required_edge_pct,
  }));

  return Response.json(
    {
      deals,
      total: deals.length,
      limit,
      updated_at: result.results[0]?.updated_at ?? null,
    },
    { headers: { "Cache-Control": cacheControl(url, 120) } },
  );
}
