import { cacheControl } from "../utils/cache";

/**
 * Search across everything a trader can act on: markets, dispensers, pools,
 * and assets that have none of those yet.
 *
 * Deliberately NOT a block explorer. Transaction hashes and addresses are not
 * searchable here — they belong to a different question ("what happened?")
 * than the one this box answers ("what can I trade?"), and mixing them makes
 * every result list harder to scan for the common case.
 *
 * All four run in ONE D1 batch, so adding a category costs a query rather
 * than a round trip. Each is capped low: this feeds a palette where the top
 * few per category is the useful part, and a longer list is what the
 * dedicated pages are for.
 */

/**
 * Per category. Six for the mixed palette; a category the user has actually
 * asked for by name gets a real page's worth.
 */
const PER_CATEGORY = 6;
const PER_CATEGORY_FOCUSED = 30;

export async function handleSearch(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const empty = { pairs: [], dispensers: [], pools: [], assets: [] };
  if (q.length < 2) {
    return Response.json(empty, {
      headers: { "Cache-Control": cacheControl(url, 60) },
    });
  }

  const like = `%${q}%`;
  const upper = q.toUpperCase();
  // Prefix matches rank above loose substring ones — typing "STAR" should put
  // STAR and STARMONEY above MYSTARS. Exact is handled separately below.
  const prefix = `${q}%`;

  /**
   * One category at a time, when asked. The palette shows a slice of each;
   * a tab shows one properly.
   */
  const only = url.searchParams.get("category");
  /** Only the focused category grows; the rest stay a slice, and the whole
   *  thing is still one batch so tab-switching costs one request either way. */
  const cap = (name: string) => (only === name ? PER_CATEGORY_FOCUSED : PER_CATEGORY);

  /**
   * Numeric assets are excluded unless the query looks like one.
   *
   * There are ~7,400 of them and they match constantly on longname, so a
   * search for "PEPE" was returning A10028209680938788433 in the dispenser
   * list — a row whose visible text does not contain the query at all.
   * Someone hunting a specific numeric asset types digits, and this lets
   * that through.
   */
  const numericQuery = /^a?\d/i.test(q);
  const noNumeric = (col: string) =>
    numericQuery ? "" : `AND ${col} NOT GLOB 'A[0-9]*' `;

  /**
   * Ranking, in the order a reader would: what matched, then how real it is.
   *
   * It used to be `volume_24h DESC` alone, which sounds sensible and is not:
   * 95% of markets have not traded in a YEAR, so the sort key was 0 for
   * nearly every row and results came back in whatever order the table
   * happened to hold them. Searching "STAR" led with STARMIE and STARRYDANK
   * over anything anyone had heard of. All-time activity is the column that
   * actually distinguishes these rows, with 24h kept only as a tiebreak so a
   * currently-hot market still floats within its band.
   */
  const RANK_MATCH = (a: string, b: string) =>
    `CASE WHEN UPPER(${a}) = ?2 OR UPPER(COALESCE(${b}, '')) = ?2 THEN 0
          WHEN ${a} LIKE ?3 OR COALESCE(${b}, '') LIKE ?3 THEN 1
          ELSE 2 END`;

  const [pairResult, dispenserResult, poolResult, assetResult] = await db.batch([
    db
      .prepare(
        `SELECT pair, base_asset, quote_asset, base_asset_longname, last_price, volume_24h, trade_count_24h
         FROM pair_stats
         WHERE hidden = 0
           -- XCP/XCP and friends are artefacts, not markets. A pair with
           -- itself has no price to quote and nothing to trade.
           AND base_asset <> quote_asset
           -- The BASE side only. Matching the quote loosely meant "XCP"
           -- returned all 6,361 markets priced in XCP, ranked by nothing.
           AND (base_asset LIKE ?1 OR base_asset_longname LIKE ?1 OR UPPER(quote_asset) = ?2)
           ${noNumeric("base_asset")}
         ORDER BY
           ${RANK_MATCH("base_asset", "base_asset_longname")},
           COALESCE(total_volume, 0) DESC,
           COALESCE(volume_24h, 0) DESC
         LIMIT ${cap("markets")}`
      )
      .bind(like, upper, prefix),
    db
      .prepare(
        `SELECT asset, asset_longname, last_dispense_price, cheapest_price, volume_24h, active_dispensers
         FROM dispenser_stats
         WHERE hidden = 0 AND active_dispensers > 0
           AND (asset LIKE ?1 OR asset_longname LIKE ?1)
           ${noNumeric("asset")}
         ORDER BY
           ${RANK_MATCH("asset", "asset_longname")},
           COALESCE(total_btc_spent, 0) DESC,
           COALESCE(active_dispensers, 0) DESC
         LIMIT ${cap("dispensers")}`
      )
      .bind(like, upper, prefix),
    db
      .prepare(
        `SELECT lp_asset, pair, asset_a, asset_b, reserve_a, reserve_b, match_count
         FROM pools
         WHERE reserve_a_raw > 0 AND reserve_b_raw > 0
           AND (asset_a LIKE ?1 OR asset_b LIKE ?1 OR UPPER(lp_asset) = ?2)
         ORDER BY
           CASE WHEN UPPER(asset_a) = ?2 OR UPPER(asset_b) = ?2 OR UPPER(lp_asset) = ?2 THEN 0
                WHEN asset_a LIKE ?3 OR asset_b LIKE ?3 THEN 1
                ELSE 2 END,
           match_count DESC
         LIMIT ${cap("pools")}`
      )
      .bind(like, upper, prefix),
    // The catch-all: an asset with no market, dispenser or pool is still a
    // real thing with a page. Ranked newest-first, because an old asset with
    // no activity anywhere is rarely what someone is hunting for.
    db
      .prepare(
        `SELECT asset, asset_longname, supply_normalized, locked, first_issuance_block_time
         FROM assets
         WHERE (asset LIKE ?1 OR asset_longname LIKE ?1)
           ${noNumeric("asset")}
         ORDER BY
           ${RANK_MATCH("asset", "asset_longname")},
           -- Shortest name first among equal-quality matches. "PEPE" should
           -- lead with PEPE, then PEPECASH — not PEPEZZLE, which is only
           -- first because it was issued most recently.
           LENGTH(asset),
           COALESCE(first_issuance_block_time, 0) DESC
         LIMIT ${cap("assets")}`
      )
      .bind(like, upper, prefix),
  ]);

  return Response.json(
    {
      pairs: pairResult.results,
      dispensers: dispenserResult.results,
      pools: poolResult.results,
      assets: assetResult.results,
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}
