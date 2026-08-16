import { cacheControl } from "../utils/cache";

/**
 * Every tradeable asset, aggregated across the markets and dispensers it
 * appears in.
 *
 * This is the ASSET view, deliberately distinct from /markets. A market is a
 * pair; an asset can have several, and "how is PEPECASH doing" is not
 * answered by picking one of its books.
 *
 * Two volume totals, because neither one answers both questions.
 *
 * `base_volume` is units of the asset itself, summed across every market that
 * prices it. It is the honest total for ONE asset — the same unit in every
 * one of its books — and it is what makes its markets comparable to each
 * other. It does NOT compare across rows: a million GEMZ and a million
 * PEPECASH are a million of different things.
 *
 * `xcp_volume` is what ranks the list, and it is the site's existing
 * convention (see routes/analytics.ts): quote volume from the XCP-quoted
 * markets only. One unit for every row, so the ordering means something.
 * Restricting rather than converting is deliberate — there is no FX rate in
 * the database to turn a BTC-quoted or PEPECASH-quoted trade into XCP, and
 * inventing one would put a made-up number at the top of the page. Assets
 * that trade only against a non-XCP quote therefore rank low on this metric
 * and are found by sorting on trades or base volume instead.
 *
 * The response also carries the signals that say what KIND of thing each row
 * is — supply, divisibility, how many markets price it, how many markets are
 * priced IN it, whether it has dispensers. A 1-of-1 card and a currency are
 * both "assets" and almost nothing said about one is true of the other; the
 * client uses these to label and filter rather than presenting a card as a
 * token.
 */

const WINDOWS = new Set(["24h", "30d", "1y", "all"]);

/** Sort key -> the expression it maps to. Validated, never interpolated raw. */
const SORTS: Record<string, string> = {
  xcp_volume: "xcp_volume",
  base_volume: "base_volume",
  trades: "trade_count",
  markets: "market_count",
  quote_markets: "quote_market_count",
  dispensers: "active_dispensers",
  last_trade_time: "last_trade_time",
  supply: "supply_normalized",
  first_issuance: "first_issuance_block_index",
};

/**
 * The kind thresholds. MIRRORED in apps/web/src/lib/asset-kind.ts, which
 * classifies on the asset detail page where these same signals arrive from a
 * different endpoint. This copy is authoritative for lists, because a list
 * has to filter and page in SQL — classifying after pagination would return
 * short pages.
 */
const CURRENCY_MIN_QUOTE_PAIRS = 10;

/**
 * Same ladder as classifyAsset(): role, then form, then how many there are.
 *
 * No clause reads a trade count. Kind used to end in `token` (3+ trades) and
 * `thin` (fewer), which made the column answer "what is this" and "does it
 * trade" at once — and the second answer was already in the Trades column.
 * Activity is now sorted and filtered on, never labelled.
 *
 * `divisible <> 0` rather than `= 1` so a NULL divisible (an asset the
 * indexer has no issuance row for) lands in `token` instead of being called a
 * 1-of-1 on the strength of a missing supply.
 */
const KIND_EXPR = `
  CASE
    WHEN COALESCE(quote_market_count, 0) >= ${CURRENCY_MIN_QUOTE_PAIRS} THEN 'currency'
    WHEN COALESCE(divisible, 1) <> 0 THEN 'token'
    WHEN supply_normalized = 1 THEN 'one_of_one'
    ELSE 'edition'
  END`;

const KINDS = new Set(["currency", "token", "edition", "one_of_one"]);

/** Upper bound on `assets=`; well past any real list, short of a DoS. */
const MAX_ASSET_FILTER = 200;

export async function handleAssets(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const tfParam = url.searchParams.get("timeframe") ?? "";
  const tf = WINDOWS.has(tfParam) ? tfParam : "24h";
  const sortParam = url.searchParams.get("sort") ?? "xcp_volume";
  const sortCol = SORTS[sortParam in SORTS ? sortParam : "xcp_volume"];
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
  const includeHidden = url.searchParams.get("include_hidden") === "1";
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam && KINDS.has(kindParam) ? kindParam : null;
  /**
   * An explicit set of assets, comma-separated. For lists whose membership is
   * decided elsewhere — /explore/launches asks xcp.fun which assets graduated
   * an XCP-69 launch, then asks this route what they are worth. Without it a
   * caller holding twenty names would have to page the whole table to find
   * them.
   *
   * Capped, because the filter is inlined as placeholders and a caller could
   * otherwise hand us a query with ten thousand of them.
   */
  const assetsParam = url.searchParams.get("assets");
  const assetList = assetsParam
    ? assetsParam
        .split(",")
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, MAX_ASSET_FILTER)
    : [];
  // An empty `assets=` is a filter matching nothing, not an absent filter —
  // otherwise asking for none of them returns all of them.
  const assetFilter = assetsParam !== null;
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const baseVolCol = tf === "all" ? "total_base_volume" : `base_volume_${tf}`;
  const volCol = tf === "all" ? "total_volume" : `volume_${tf}`;
  const countCol = tf === "all" ? "total_trade_count" : `trade_count_${tf}`;
  const pctCol = tf === "all" ? "0" : `price_change_${tf}`;
  const hiddenFilter = includeHidden ? "" : "WHERE hidden = 0";

  // Kind and asset-set compose: /explore/launches passes a set, and the kind
  // pills still narrow within it. An empty set short-circuits to a predicate
  // no row satisfies rather than to no predicate at all.
  const clauses: string[] = [];
  if (kind) clauses.push("kind = ?");
  if (assetFilter) {
    clauses.push(
      assetList.length > 0
        ? `asset IN (${assetList.map(() => "?").join(",")})`
        : "0"
    );
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  /**
   * Four CTEs, because an asset has four independent roles and a row needs
   * all of them:
   *
   *  priced  — summed across the markets where it is the BASE. This is the
   *            asset's own trading.
   *  deepest — the single deepest of those markets, for a price to show.
   *            SQLite's documented bare-column rule applies: with exactly one
   *            MAX() aggregate, the unaggregated columns come from the row
   *            that produced the max. That is why this CTE has one aggregate
   *            and no other.
   *  quoting — how many markets are priced IN it. This is the money signal,
   *            and it is why XCP is not described as thinly traded on the
   *            strength of having only one market of its own.
   *  disp    — dispensers, which are a venue in their own right. An asset can
   *            be perfectly tradeable with no DEX market at all, so these
   *            rows join the universe rather than being filtered out by it.
   */
  const sql = `
    WITH priced AS (
      SELECT base_asset AS asset,
             SUM(${baseVolCol}) AS base_volume,
             SUM(CASE WHEN quote_asset = 'XCP' THEN ${volCol} ELSE 0 END) AS xcp_volume,
             SUM(${countCol})   AS trade_count,
             COUNT(*)           AS market_count,
             MAX(last_trade_time) AS last_trade_time
      FROM pair_stats ${hiddenFilter}
      GROUP BY base_asset
    ),
    deepest AS (
      SELECT base_asset AS asset,
             MAX(${baseVolCol}) AS top_base_volume,
             pair       AS top_pair,
             quote_asset AS top_quote,
             last_price  AS top_price,
             ${pctCol}   AS top_price_change
      FROM pair_stats ${hiddenFilter}
      GROUP BY base_asset
    ),
    quoting AS (
      SELECT quote_asset AS asset, COUNT(*) AS quote_market_count
      FROM pair_stats ${hiddenFilter}
      GROUP BY quote_asset
    ),
    disp AS (
      SELECT asset, active_dispensers, cheapest_price, last_dispense_time
      FROM dispenser_stats
      ${includeHidden ? "" : "WHERE hidden = 0"}
    ),
    universe AS (
      SELECT asset FROM priced
      UNION SELECT asset FROM quoting
      UNION SELECT asset FROM disp WHERE active_dispensers > 0
    ),
    agg AS (
      SELECT u.asset,
             a.asset_longname,
             COALESCE(a.divisible, 0)      AS divisible,
             a.supply_normalized,
             a.first_issuance_block_index,
             COALESCE(p.base_volume, 0)    AS base_volume,
             COALESCE(p.xcp_volume, 0)     AS xcp_volume,
             COALESCE(p.trade_count, 0)    AS trade_count,
             COALESCE(p.market_count, 0)   AS market_count,
             p.last_trade_time,
             COALESCE(q.quote_market_count, 0) AS quote_market_count,
             COALESCE(d.active_dispensers, 0)  AS active_dispensers,
             d.cheapest_price,
             d.last_dispense_time,
             t.top_pair, t.top_quote, t.top_price, t.top_price_change
      FROM universe u
      LEFT JOIN priced  p ON p.asset = u.asset
      LEFT JOIN deepest t ON t.asset = u.asset
      LEFT JOIN quoting q ON q.asset = u.asset
      LEFT JOIN disp    d ON d.asset = u.asset
      LEFT JOIN assets  a ON a.asset = u.asset
    ),
    kinded AS (SELECT *, ${KIND_EXPR} AS kind FROM agg)
    SELECT * FROM kinded
    ${where}
    ORDER BY ${sortCol} ${order}, asset ASC
    LIMIT ? OFFSET ?`;

  const countSql = `
    WITH priced AS (
      SELECT base_asset AS asset, SUM(${countCol}) AS trade_count, COUNT(*) AS market_count
      FROM pair_stats ${hiddenFilter} GROUP BY base_asset
    ),
    quoting AS (
      SELECT quote_asset AS asset, COUNT(*) AS quote_market_count
      FROM pair_stats ${hiddenFilter} GROUP BY quote_asset
    ),
    disp AS (
      SELECT asset, active_dispensers FROM dispenser_stats
      ${includeHidden ? "" : "WHERE hidden = 0"}
    ),
    universe AS (
      SELECT asset FROM priced
      UNION SELECT asset FROM quoting
      UNION SELECT asset FROM disp WHERE active_dispensers > 0
    ),
    agg AS (
      SELECT u.asset,
             COALESCE(a.divisible, 0) AS divisible,
             a.supply_normalized,
             COALESCE(p.trade_count, 0)  AS trade_count,
             COALESCE(p.market_count, 0) AS market_count,
             COALESCE(q.quote_market_count, 0) AS quote_market_count,
             COALESCE(d.active_dispensers, 0)  AS active_dispensers
      FROM universe u
      LEFT JOIN priced  p ON p.asset = u.asset
      LEFT JOIN quoting q ON q.asset = u.asset
      LEFT JOIN disp    d ON d.asset = u.asset
      LEFT JOIN assets  a ON a.asset = u.asset
    ),
    kinded AS (SELECT *, ${KIND_EXPR} AS kind FROM agg)
    SELECT COUNT(*) AS total FROM kinded ${where}`;

  const binds: (string | number)[] = [
    ...(kind ? [kind] : []),
    ...(assetFilter ? assetList : []),
  ];

  const [result, countResult] = await Promise.all([
    db
      .prepare(sql)
      .bind(...binds, limit, offset)
      .all(),
    db
      .prepare(countSql)
      .bind(...binds)
      .first<{ total: number }>(),
  ]);

  return Response.json(
    {
      timeframe: tf,
      assets: result.results,
      total: countResult?.total ?? 0,
      limit,
      offset,
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}
