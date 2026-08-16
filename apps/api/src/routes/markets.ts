import { cacheControl } from "../utils/cache";

/**
 * Active spot markets for the selected window, ordered by traded volume.
 *
 * This is a trading view, not the aggregator feed: /coingecko/tickers stays
 * pinned to its allowlist because CoinGecko reconciles against it, while this
 * endpoint answers "what is actually trading right now". A market qualifies on
 * having traded inside the window, so the list turns over as activity does
 * rather than tracking a fixed roster.
 */

const WINDOWS = new Set(["24h", "30d", "1y", "all"]);

/** Sort key -> the pair_stats expression it maps to, per window. */
const SORTS: Record<string, (tf: string) => string> = {
  volume: (tf) => (tf === "all" ? "total_volume" : `volume_${tf}`),
  base_volume: (tf) => (tf === "all" ? "total_base_volume" : `base_volume_${tf}`),
  trades: (tf) => (tf === "all" ? "total_trade_count" : `trade_count_${tf}`),
  price_change: (tf) => (tf === "all" ? "0" : `price_change_${tf}`),
  last_price: () => "last_price",
  high: (tf) => (tf === "all" ? "all_time_high" : `high_${tf}`),
  low: (tf) => (tf === "all" ? "all_time_low" : `low_${tf}`),
  last_trade_time: () => "last_trade_time",
};

export async function handleMarkets(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const tfParam = url.searchParams.get("timeframe") ?? "";
  const tf = WINDOWS.has(tfParam) ? tfParam : "24h";
  const quote = url.searchParams.get("quote");
  const sortParam = url.searchParams.get("sort") ?? "volume";
  const sortKey = sortParam in SORTS ? sortParam : "volume";
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
  const includeHidden = url.searchParams.get("include_hidden") === "1";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const volCol = tf === "all" ? "total_volume" : `volume_${tf}`;
  const baseVolCol = tf === "all" ? "total_base_volume" : `base_volume_${tf}`;
  const countCol = tf === "all" ? "total_trade_count" : `trade_count_${tf}`;
  const pctCol = tf === "all" ? "0" : `price_change_${tf}`;
  const highCol = tf === "all" ? "all_time_high" : `high_${tf}`;
  const lowCol = tf === "all" ? "all_time_low" : `low_${tf}`;
  // Sort keys and window columns are both built from validated input, never
  // interpolated from raw query params - D1 cannot parameterize identifiers.
  const sortCol = SORTS[sortKey](tf);

  const conditions = [`${countCol} > 0`];
  const binds: (string | number)[] = [];
  if (!includeHidden) conditions.push(`hidden = 0`);
  if (quote) {
    conditions.push(`quote_asset = ?`);
    binds.push(quote);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const [result, countResult] = await Promise.all([
    db
      .prepare(
        `SELECT pair, base_asset, quote_asset, base_asset_longname, quote_asset_longname,
                last_price, last_trade_time, last_side,
                ${volCol} AS volume,
                ${baseVolCol} AS base_volume,
                ${countCol} AS trade_count,
                ${pctCol} AS price_change,
                ${highCol} AS high,
                ${lowCol} AS low,
                open_orders, best_bid, best_ask, spread
         FROM pair_stats
         ${where}
         ORDER BY ${sortCol} ${order}, pair ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...binds, limit, offset)
      .all(),
    db
      .prepare(`SELECT COUNT(*) as total FROM pair_stats ${where}`)
      .bind(...binds)
      .first<{ total: number }>(),
  ]);

  return Response.json(
    {
      timeframe: tf,
      markets: result.results,
      total: countResult?.total ?? 0,
      limit,
      offset,
    },
    {
      headers: {
        "Cache-Control": cacheControl(url, 60),
      },
    }
  );
}
