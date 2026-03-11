import { cacheControl } from "../utils/cache";

interface DealRow {
  asset: string;
  quote: string;
  asset_longname: string | null;
  fair_value: number | null;
  fair_value_method: string | null;
  last_price: number | null;
  highest_price: number | null;
  lowest_price: number | null;
  average_price: number | null;
  median_price: number | null;
  recent_sales_json: string | null;
  cheapest_listing_price: number | null;
  cheapest_listing_type: string | null;
  cheapest_listing_qty: number | null;
  discount_pct: number | null;
  dispenser_cheapest_btc: number | null;
  dispenser_last_price_btc: number | null;
  dispenser_active: number;
  dispenser_unique_buyers: number;
  total_trades: number;
  avg_days_between_trades: number | null;
  last_trade_days_ago: number | null;
  active_buy_orders: number;
  unique_traders: number;
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
    200,
  );
  const sortCol = url.searchParams.get("sort") ?? "score";
  const allowedSorts: Record<string, string> = {
    score: "score DESC",
    discount_pct: "discount_pct DESC",
    avg_days_between_trades: "avg_days_between_trades ASC",
    total_trade_count: "total_trades DESC",
  };
  const orderBy = allowedSorts[sortCol] ?? "score DESC";

  const quoteClause = quoteFilter ? "AND quote = ?" : "";
  const binds: unknown[] = [limit];
  if (quoteFilter) binds.push(quoteFilter);

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
    asset: r.asset,
    asset_longname: r.asset_longname,
    collections: r.collections_json ? JSON.parse(r.collections_json) : [],
    quote: r.quote,
    fair_value: r.fair_value,
    fair_value_method: r.fair_value_method,
    last_price: r.last_price,
    highest_price: r.highest_price,
    lowest_price: r.lowest_price,
    average_price: r.average_price,
    median_price: r.median_price,
    recent_sales: r.recent_sales_json ? JSON.parse(r.recent_sales_json) : [],
    cheapest_listing_price: r.cheapest_listing_price,
    cheapest_listing_type: r.cheapest_listing_type,
    cheapest_listing_qty: r.cheapest_listing_qty,
    discount_pct: r.discount_pct,
    dispenser_cheapest_btc: r.dispenser_cheapest_btc,
    dispenser_last_price_btc: r.dispenser_last_price_btc,
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
