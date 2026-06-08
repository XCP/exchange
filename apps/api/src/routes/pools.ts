import { cacheControl } from "../utils/cache";
import { orientPoolDisplay } from "../lib/pools";
import { calculateFeeApy, calculatePoolFeePeriodReturnInQuote } from "../lib/pool-math";

const VALID_POOL_SORTS = new Set([
  "match_count",
  "deposit_count",
  "withdrawal_count",
  "last_block_time",
  "opened_block_time",
  "total_fees_value",
  "fees_24h_value",
  "fees_7d_value",
  "fees_30d_value",
  "total_volume_value",
  "volume_24h_value",
  "volume_7d_value",
  "volume_30d_value",
  "implied_fee_apy_24h",
  "implied_fee_apy_7d",
  "implied_fee_apy_30d",
]);

const VALID_POOL_STATUSES = new Set(["active", "inactive"]);

const POOL_SORT_SQL: Record<string, string> = {
  match_count: "p.match_count",
  deposit_count: "p.deposit_count",
  withdrawal_count: "p.withdrawal_count",
  last_block_time: "p.last_block_time",
  opened_block_time: "p.opened_block_time",
  total_fees_value: "total_fees_value",
  fees_24h_value: "fees_24h_value",
  fees_7d_value: "fees_7d_value",
  fees_30d_value: "fees_30d_value",
  total_volume_value: "total_volume_value",
  volume_24h_value: "volume_24h_value",
  volume_7d_value: "volume_7d_value",
  volume_30d_value: "volume_30d_value",
  implied_fee_apy_24h: "implied_fee_period_return_24h",
  implied_fee_apy_7d: "implied_fee_period_return_7d",
  implied_fee_apy_30d: "implied_fee_period_return_30d",
};

interface PoolRow {
  lp_asset: string;
  pair: string;
  asset_a: string;
  asset_b: string;
  reserve_a: number;
  reserve_b: number;
  reserve_a_raw: number;
  reserve_b_raw: number;
  opened_tx_hash: string | null;
  opened_block_index: number | null;
  opened_block_time: number | null;
  last_tx_hash: string | null;
  last_block_index: number | null;
  last_block_time: number | null;
  deposit_count: number;
  withdrawal_count: number;
  match_count: number;
  restart_count: number;
  total_fees_a: number;
  total_fees_b: number;
  total_fees_a_raw: number;
  total_fees_b_raw: number;
  updated_at: number;
}

interface PoolListRow extends PoolRow {
  fees_24h_a: number;
  fees_24h_b: number;
  fees_7d_a: number;
  fees_7d_b: number;
  fees_30d_a: number;
  fees_30d_b: number;
  volume_a: number;
  volume_b: number;
  volume_24h_a: number;
  volume_24h_b: number;
  volume_7d_a: number;
  volume_7d_b: number;
  volume_30d_a: number;
  volume_30d_b: number;
  implied_fee_period_return_24h: number | null;
  implied_fee_period_return_7d: number | null;
  implied_fee_period_return_30d: number | null;
}

interface PoolListSummaryRow {
  total_pools: number;
  active_pools: number;
  tf_active_pools: number;
  new_pools: number;
  tf_volume_xcp: number;
  total_trades: number;
  tf_trades: number;
  tf_non_xcp_trades: number;
  total_deposits: number;
  tf_deposits: number;
  total_withdrawals: number;
  tf_withdrawals: number;
  xcp_liquidity: number;
  xcp_pool_count: number;
}

interface AddressPoolRow {
  lp_asset: string;
  pair: string;
  asset_a: string;
  asset_b: string;
  reserve_a: number;
  reserve_b: number;
  balance: number;
  balance_raw: number;
  total_lp_supply_raw: number;
  total_lp_supply: number;
  implied_fees_a: number;
  implied_fees_b: number;
}

interface PoolBalanceAggregate {
  balance: number;
  balance_raw: number;
  updated_block_index: number | null;
  updated_block_time: number | null;
}

function withPoolDisplay<T extends { asset_a: string; asset_b: string; reserve_a: number; reserve_b: number }>(
  pool: T
): T & {
  display_base_asset: string;
  display_quote_asset: string;
  display_pair: string;
  display_pair_slug: string;
  display_price: number | null;
  display_base_reserve: number;
  display_quote_reserve: number;
} {
  const display = orientPoolDisplay(pool.asset_a, pool.asset_b);
  const displayBaseReserve = display.display_base_asset === pool.asset_a ? pool.reserve_a : pool.reserve_b;
  const displayQuoteReserve = display.display_quote_asset === pool.asset_a ? pool.reserve_a : pool.reserve_b;

  return {
    ...pool,
    ...display,
    display_price: displayBaseReserve > 0 ? displayQuoteReserve / displayBaseReserve : null,
    display_base_reserve: displayBaseReserve,
    display_quote_reserve: displayQuoteReserve,
  };
}

function displayAmounts(
  pool: ReturnType<typeof withPoolDisplay>,
  quantityA: number,
  quantityB: number
) {
  return {
    base_asset: pool.display_base_asset,
    quote_asset: pool.display_quote_asset,
    base_quantity: pool.display_base_asset === pool.asset_a ? quantityA : quantityB,
    quote_quantity: pool.display_quote_asset === pool.asset_a ? quantityA : quantityB,
  };
}

function valueDisplayAmountsInQuote(
  amounts: ReturnType<typeof displayAmounts>,
  priceInQuote: number | null
): number | null {
  if (priceInQuote == null || !Number.isFinite(priceInQuote)) return null;
  return amounts.quote_quantity + amounts.base_quantity * priceInQuote;
}

export async function handlePools(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const sort = VALID_POOL_SORTS.has(url.searchParams.get("sort") ?? "")
    ? url.searchParams.get("sort")!
    : "match_count";
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
  const asset = url.searchParams.get("asset")?.toUpperCase();
  const tag = url.searchParams.get("tag");
  const status = VALID_POOL_STATUSES.has(url.searchParams.get("status") ?? "")
    ? url.searchParams.get("status")!
    : null;
  const includeHidden = url.searchParams.get("include_hidden") === "1";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 24 * 60 * 60;
  const weekAgo = now - 7 * 24 * 60 * 60;
  const monthAgo = now - 30 * 24 * 60 * 60;
  const timeframe = url.searchParams.get("timeframe");
  const timeframeCutoff = timeframe === "24h"
    ? dayAgo
    : timeframe === "7d"
      ? weekAgo
      : timeframe === "30d"
        ? monthAgo
        : 0;

  let query = `SELECT
    p.lp_asset, p.pair, p.asset_a, p.asset_b,
    p.reserve_a, p.reserve_b, p.reserve_a_raw, p.reserve_b_raw,
    p.opened_tx_hash, p.opened_block_index, p.opened_block_time,
    p.last_tx_hash, p.last_block_index, p.last_block_time,
    p.deposit_count, p.withdrawal_count, p.match_count, p.restart_count,
    p.total_fees_a, p.total_fees_b, p.total_fees_a_raw, p.total_fees_b_raw,
    p.updated_at,
    COALESCE(f.fees_24h_a, 0) AS fees_24h_a,
    COALESCE(f.fees_24h_b, 0) AS fees_24h_b,
    COALESCE(f.fees_7d_a, 0) AS fees_7d_a,
    COALESCE(f.fees_7d_b, 0) AS fees_7d_b,
    COALESCE(f.fees_30d_a, 0) AS fees_30d_a,
    COALESCE(f.fees_30d_b, 0) AS fees_30d_b,
    COALESCE(f.volume_a, 0) AS volume_a,
    COALESCE(f.volume_b, 0) AS volume_b,
    COALESCE(f.volume_24h_a, 0) AS volume_24h_a,
    COALESCE(f.volume_24h_b, 0) AS volume_24h_b,
    COALESCE(f.volume_7d_a, 0) AS volume_7d_a,
    COALESCE(f.volume_7d_b, 0) AS volume_7d_b,
    COALESCE(f.volume_30d_a, 0) AS volume_30d_a,
    COALESCE(f.volume_30d_b, 0) AS volume_30d_b,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.fees_24h_b, 0) + COALESCE(f.fees_24h_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS fees_24h_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.fees_7d_b, 0) + COALESCE(f.fees_7d_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS fees_7d_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.fees_30d_b, 0) + COALESCE(f.fees_30d_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS fees_30d_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN p.total_fees_b + p.total_fees_a * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS total_fees_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.volume_b, 0) + COALESCE(f.volume_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS total_volume_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.volume_24h_b, 0) + COALESCE(f.volume_24h_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS volume_24h_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.volume_7d_b, 0) + COALESCE(f.volume_7d_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS volume_7d_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN COALESCE(f.volume_30d_b, 0) + COALESCE(f.volume_30d_a, 0) * (p.reserve_b / p.reserve_a)
      ELSE 0
    END AS volume_30d_value,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN (
        (COALESCE(f.fees_24h_b, 0) + COALESCE(f.fees_24h_a, 0) * (p.reserve_b / p.reserve_a))
        / (p.reserve_b + p.reserve_a * (p.reserve_b / p.reserve_a))
      )
      ELSE NULL
    END AS implied_fee_period_return_24h,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN (
        (COALESCE(f.fees_7d_b, 0) + COALESCE(f.fees_7d_a, 0) * (p.reserve_b / p.reserve_a))
        / (p.reserve_b + p.reserve_a * (p.reserve_b / p.reserve_a))
      )
      ELSE NULL
    END AS implied_fee_period_return_7d,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN (
        (COALESCE(f.fees_30d_b, 0) + COALESCE(f.fees_30d_a, 0) * (p.reserve_b / p.reserve_a))
        / (p.reserve_b + p.reserve_a * (p.reserve_b / p.reserve_a))
      )
      ELSE NULL
    END AS implied_fee_period_return_30d
  FROM pools p
  LEFT JOIN (
    SELECT lp_asset,
           SUM(CASE WHEN fee_asset = asset_a AND block_time >= ? THEN fee_quantity ELSE 0 END) AS fees_24h_a,
           SUM(CASE WHEN fee_asset = asset_b AND block_time >= ? THEN fee_quantity ELSE 0 END) AS fees_24h_b,
           SUM(CASE WHEN fee_asset = asset_a AND block_time >= ? THEN fee_quantity ELSE 0 END) AS fees_7d_a,
           SUM(CASE WHEN fee_asset = asset_b AND block_time >= ? THEN fee_quantity ELSE 0 END) AS fees_7d_b,
           SUM(CASE WHEN fee_asset = asset_a AND block_time >= ? THEN fee_quantity ELSE 0 END) AS fees_30d_a,
           SUM(CASE WHEN fee_asset = asset_b AND block_time >= ? THEN fee_quantity ELSE 0 END) AS fees_30d_b,
           SUM(CASE WHEN forward_asset = asset_a THEN forward_quantity WHEN backward_asset = asset_a THEN backward_quantity ELSE 0 END) AS volume_a,
           SUM(CASE WHEN forward_asset = asset_b THEN forward_quantity WHEN backward_asset = asset_b THEN backward_quantity ELSE 0 END) AS volume_b,
           SUM(CASE WHEN block_time >= ? THEN CASE WHEN forward_asset = asset_a THEN forward_quantity WHEN backward_asset = asset_a THEN backward_quantity ELSE 0 END ELSE 0 END) AS volume_24h_a,
           SUM(CASE WHEN block_time >= ? THEN CASE WHEN forward_asset = asset_b THEN forward_quantity WHEN backward_asset = asset_b THEN backward_quantity ELSE 0 END ELSE 0 END) AS volume_24h_b,
           SUM(CASE WHEN block_time >= ? THEN CASE WHEN forward_asset = asset_a THEN forward_quantity WHEN backward_asset = asset_a THEN backward_quantity ELSE 0 END ELSE 0 END) AS volume_7d_a,
           SUM(CASE WHEN block_time >= ? THEN CASE WHEN forward_asset = asset_b THEN forward_quantity WHEN backward_asset = asset_b THEN backward_quantity ELSE 0 END ELSE 0 END) AS volume_7d_b,
           SUM(CASE WHEN block_time >= ? THEN CASE WHEN forward_asset = asset_a THEN forward_quantity WHEN backward_asset = asset_a THEN backward_quantity ELSE 0 END ELSE 0 END) AS volume_30d_a,
           SUM(CASE WHEN block_time >= ? THEN CASE WHEN forward_asset = asset_b THEN forward_quantity WHEN backward_asset = asset_b THEN backward_quantity ELSE 0 END ELSE 0 END) AS volume_30d_b
    FROM pool_matches
    WHERE status IN ('valid', 'completed')
    GROUP BY lp_asset
  ) f ON f.lp_asset = p.lp_asset`;
  let countQuery = `SELECT COUNT(*) AS total FROM pools`;
  let summaryQuery = `SELECT
    COUNT(*) AS total_pools,
    SUM(CASE WHEN reserve_a_raw > 0 AND reserve_b_raw > 0 THEN 1 ELSE 0 END) AS active_pools,
    SUM(CASE WHEN EXISTS (
      SELECT 1 FROM pool_matches pm
      WHERE pm.lp_asset = pools.lp_asset
        AND pm.status IN ('valid', 'completed')
        ${timeframeCutoff > 0 ? `AND pm.block_time >= ${timeframeCutoff}` : ""}
    ) THEN 1 ELSE 0 END) AS tf_active_pools,
    SUM(CASE WHEN opened_block_time IS NOT NULL ${timeframeCutoff > 0 ? `AND opened_block_time >= ${timeframeCutoff}` : ""} THEN 1 ELSE 0 END) AS new_pools,
    COALESCE(SUM((
      SELECT COALESCE(SUM(CASE
        WHEN pm.forward_asset = 'XCP' THEN pm.forward_quantity
        WHEN pm.backward_asset = 'XCP' THEN pm.backward_quantity
        ELSE 0
      END), 0)
      FROM pool_matches pm
      WHERE pm.lp_asset = pools.lp_asset
        AND pm.status IN ('valid', 'completed')
        ${timeframeCutoff > 0 ? `AND pm.block_time >= ${timeframeCutoff}` : ""}
    )), 0) AS tf_volume_xcp,
    COALESCE(SUM(match_count), 0) AS total_trades,
    COALESCE(SUM((
      SELECT COUNT(*) FROM pool_matches pm
      WHERE pm.lp_asset = pools.lp_asset
        AND pm.status IN ('valid', 'completed')
        ${timeframeCutoff > 0 ? `AND pm.block_time >= ${timeframeCutoff}` : ""}
    )), 0) AS tf_trades,
    COALESCE(SUM(CASE WHEN asset_a <> 'XCP' AND asset_b <> 'XCP' THEN (
      SELECT COUNT(*) FROM pool_matches pm
      WHERE pm.lp_asset = pools.lp_asset
        AND pm.status IN ('valid', 'completed')
        ${timeframeCutoff > 0 ? `AND pm.block_time >= ${timeframeCutoff}` : ""}
    ) ELSE 0 END), 0) AS tf_non_xcp_trades,
    COALESCE(SUM(deposit_count), 0) AS total_deposits,
    COALESCE(SUM((
      SELECT COUNT(*) FROM pool_deposits pd
      WHERE pd.lp_asset = pools.lp_asset
        AND pd.status = 'valid'
        ${timeframeCutoff > 0 ? `AND pd.block_time >= ${timeframeCutoff}` : ""}
    )), 0) AS tf_deposits,
    COALESCE(SUM(withdrawal_count), 0) AS total_withdrawals,
    COALESCE(SUM((
      SELECT COUNT(*) FROM pool_withdrawals pw
      WHERE pw.lp_asset = pools.lp_asset
        AND pw.status = 'valid'
        ${timeframeCutoff > 0 ? `AND pw.block_time >= ${timeframeCutoff}` : ""}
    )), 0) AS tf_withdrawals,
    COALESCE(SUM(CASE
      WHEN asset_a = 'XCP' THEN reserve_a
      WHEN asset_b = 'XCP' THEN reserve_b
      ELSE 0
    END), 0) AS xcp_liquidity,
    SUM(CASE WHEN asset_a = 'XCP' OR asset_b = 'XCP' THEN 1 ELSE 0 END) AS xcp_pool_count
  FROM pools`;
  const binds: (string | number)[] = [
    dayAgo,
    dayAgo,
    weekAgo,
    weekAgo,
    monthAgo,
    monthAgo,
    dayAgo,
    dayAgo,
    weekAgo,
    weekAgo,
    monthAgo,
    monthAgo,
  ];
  const countBinds: (string | number)[] = [];
  const summaryBinds: (string | number)[] = [];
  const conditions: string[] = [];
  const countConditions: string[] = [];

  if (asset) {
    conditions.push(`(p.asset_a = ? OR p.asset_b = ? OR p.lp_asset = ?)`);
    countConditions.push(`(asset_a = ? OR asset_b = ? OR lp_asset = ?)`);
    binds.push(asset, asset, asset);
    countBinds.push(asset, asset, asset);
    summaryBinds.push(asset, asset, asset);
  }

  if (tag) {
    conditions.push(`(p.asset_a IN (SELECT ta.asset FROM tag_assets ta JOIN tags t ON ta.tag_id = t.id WHERE t.slug = ? AND t.tag_type = 'collection')
      OR p.asset_b IN (SELECT ta.asset FROM tag_assets ta JOIN tags t ON ta.tag_id = t.id WHERE t.slug = ? AND t.tag_type = 'collection'))`);
    countConditions.push(`(asset_a IN (SELECT ta.asset FROM tag_assets ta JOIN tags t ON ta.tag_id = t.id WHERE t.slug = ? AND t.tag_type = 'collection')
      OR asset_b IN (SELECT ta.asset FROM tag_assets ta JOIN tags t ON ta.tag_id = t.id WHERE t.slug = ? AND t.tag_type = 'collection'))`);
    binds.push(tag, tag);
    countBinds.push(tag, tag);
    summaryBinds.push(tag, tag);
  }

  if (status === "active") {
    conditions.push(`p.reserve_a_raw > 0 AND p.reserve_b_raw > 0`);
    countConditions.push(`reserve_a_raw > 0 AND reserve_b_raw > 0`);
  } else if (status === "inactive") {
    conditions.push(`(p.reserve_a_raw <= 0 OR p.reserve_b_raw <= 0)`);
    countConditions.push(`(reserve_a_raw <= 0 OR reserve_b_raw <= 0)`);
  }

  if (!includeHidden) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM pair_stats ps
      WHERE ps.hidden = 1
        AND (ps.pair = p.pair OR ps.pair = p.asset_b || '_' || p.asset_a)
    )`);
    countConditions.push(`NOT EXISTS (
      SELECT 1 FROM pair_stats ps
      WHERE ps.hidden = 1
        AND (ps.pair = pools.pair OR ps.pair = pools.asset_b || '_' || pools.asset_a)
    )`);
  }

  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  if (countConditions.length) {
    countQuery += ` WHERE ${countConditions.join(" AND ")}`;
    summaryQuery += ` WHERE ${countConditions.join(" AND ")}`;
  }

  query += ` ORDER BY ${POOL_SORT_SQL[sort]} ${order}, p.lp_asset ASC LIMIT ? OFFSET ?`;

  const [result, countResult, summaryResult] = await Promise.all([
    db.prepare(query).bind(...binds, limit, offset).all<PoolListRow>(),
    db.prepare(countQuery).bind(...countBinds).first<{ total: number }>(),
    db.prepare(summaryQuery).bind(...summaryBinds).first<PoolListSummaryRow>(),
  ]);

  return Response.json(
    {
      pools: result.results.map((pool) => {
        const displayPool = withPoolDisplay(pool);
        const baseFees30d = displayPool.display_base_asset === pool.asset_a ? pool.fees_30d_a : pool.fees_30d_b;
        const quoteFees30d = displayPool.display_quote_asset === pool.asset_a ? pool.fees_30d_a : pool.fees_30d_b;
        return {
          ...displayPool,
          fees_24h_a: pool.fees_24h_a,
          fees_24h_b: pool.fees_24h_b,
          fees_7d_a: pool.fees_7d_a,
          fees_7d_b: pool.fees_7d_b,
          fees_30d_a: pool.fees_30d_a,
          fees_30d_b: pool.fees_30d_b,
          volume_a: pool.volume_a,
          volume_b: pool.volume_b,
          volume_24h_a: pool.volume_24h_a,
          volume_24h_b: pool.volume_24h_b,
          volume_7d_a: pool.volume_7d_a,
          volume_7d_b: pool.volume_7d_b,
          volume_30d_a: pool.volume_30d_a,
          volume_30d_b: pool.volume_30d_b,
          implied_fees_24h_a: pool.fees_24h_a,
          implied_fees_24h_b: pool.fees_24h_b,
          implied_fees_7d_a: pool.fees_7d_a,
          implied_fees_7d_b: pool.fees_7d_b,
          implied_fees_30d_a: pool.fees_30d_a,
          implied_fees_30d_b: pool.fees_30d_b,
          display_fees_24h_base: displayPool.display_base_asset === pool.asset_a ? pool.fees_24h_a : pool.fees_24h_b,
          display_fees_24h_quote: displayPool.display_quote_asset === pool.asset_a ? pool.fees_24h_a : pool.fees_24h_b,
          display_fees_7d_base: displayPool.display_base_asset === pool.asset_a ? pool.fees_7d_a : pool.fees_7d_b,
          display_fees_7d_quote: displayPool.display_quote_asset === pool.asset_a ? pool.fees_7d_a : pool.fees_7d_b,
          display_fees_30d_base: baseFees30d,
          display_fees_30d_quote: quoteFees30d,
          display_volume_base: displayPool.display_base_asset === pool.asset_a ? pool.volume_a : pool.volume_b,
          display_volume_quote: displayPool.display_quote_asset === pool.asset_a ? pool.volume_a : pool.volume_b,
          display_volume_24h_base: displayPool.display_base_asset === pool.asset_a ? pool.volume_24h_a : pool.volume_24h_b,
          display_volume_24h_quote: displayPool.display_quote_asset === pool.asset_a ? pool.volume_24h_a : pool.volume_24h_b,
          display_volume_7d_base: displayPool.display_base_asset === pool.asset_a ? pool.volume_7d_a : pool.volume_7d_b,
          display_volume_7d_quote: displayPool.display_quote_asset === pool.asset_a ? pool.volume_7d_a : pool.volume_7d_b,
          display_volume_30d_base: displayPool.display_base_asset === pool.asset_a ? pool.volume_30d_a : pool.volume_30d_b,
          display_volume_30d_quote: displayPool.display_quote_asset === pool.asset_a ? pool.volume_30d_a : pool.volume_30d_b,
          display_implied_fees_24h_base: displayPool.display_base_asset === pool.asset_a ? pool.fees_24h_a : pool.fees_24h_b,
          display_implied_fees_24h_quote: displayPool.display_quote_asset === pool.asset_a ? pool.fees_24h_a : pool.fees_24h_b,
          display_implied_fees_7d_base: displayPool.display_base_asset === pool.asset_a ? pool.fees_7d_a : pool.fees_7d_b,
          display_implied_fees_7d_quote: displayPool.display_quote_asset === pool.asset_a ? pool.fees_7d_a : pool.fees_7d_b,
          display_implied_fees_30d_base: baseFees30d,
          display_implied_fees_30d_quote: quoteFees30d,
          implied_fee_apy_24h: calculateFeeApy(pool.implied_fee_period_return_24h, 24 * 60 * 60),
          implied_fee_apy_7d: calculateFeeApy(pool.implied_fee_period_return_7d, 7 * 24 * 60 * 60),
          implied_fee_apy_30d: calculateFeeApy(pool.implied_fee_period_return_30d, 30 * 24 * 60 * 60),
        };
      }),
      total: countResult?.total ?? 0,
      summary: {
        total_pools: summaryResult?.total_pools ?? 0,
        active_pools: summaryResult?.active_pools ?? 0,
        tf_active_pools: summaryResult?.tf_active_pools ?? 0,
        new_pools: summaryResult?.new_pools ?? 0,
        tf_volume_xcp: summaryResult?.tf_volume_xcp ?? 0,
        total_trades: summaryResult?.total_trades ?? 0,
        tf_trades: summaryResult?.tf_trades ?? 0,
        tf_non_xcp_trades: summaryResult?.tf_non_xcp_trades ?? 0,
        total_deposits: summaryResult?.total_deposits ?? 0,
        tf_deposits: summaryResult?.tf_deposits ?? 0,
        total_withdrawals: summaryResult?.total_withdrawals ?? 0,
        tf_withdrawals: summaryResult?.tf_withdrawals ?? 0,
        xcp_liquidity: summaryResult?.xcp_liquidity ?? 0,
        xcp_pool_count: summaryResult?.xcp_pool_count ?? 0,
      },
      limit,
      offset,
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}

export async function handlePool(
  url: URL,
  db: D1Database,
  lpAsset: string
): Promise<Response> {
  const asset = lpAsset.toUpperCase();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    100
  );
  const holdersLimit = Math.min(
    parseInt(url.searchParams.get("holders_limit") ?? "25", 10) || 25,
    100
  );

  const pool = await db
    .prepare(
      `SELECT
        lp_asset, pair, asset_a, asset_b,
        reserve_a, reserve_b, reserve_a_raw, reserve_b_raw,
        opened_tx_hash, opened_block_index, opened_block_time,
        last_tx_hash, last_block_index, last_block_time,
        deposit_count, withdrawal_count, match_count, restart_count,
        total_fees_a, total_fees_b, total_fees_a_raw, total_fees_b_raw,
        updated_at
       FROM pools
       WHERE lp_asset = ?`
    )
    .bind(asset)
    .first<PoolRow>();

  if (!pool) {
    return Response.json({ error: "Pool not found" }, { status: 404 });
  }
  const displayPool = withPoolDisplay(pool);

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 24 * 60 * 60;
  const weekAgo = now - 7 * 24 * 60 * 60;
  const monthAgo = now - 30 * 24 * 60 * 60;

  const [deposits, withdrawals, matches, holders, supply, feeWindows] = await Promise.all([
    db
      .prepare(
        `SELECT event_index, tx_hash, tx_index, block_index, block_time, source, lp_asset, pair,
                asset_a, asset_b, quantity_a, quantity_b, quantity_minted,
                quantity_a_raw, quantity_b_raw, quantity_minted_raw, is_restart, status
         FROM pool_deposits
         WHERE lp_asset = ?
         ORDER BY block_time DESC, tx_index DESC
         LIMIT ?`
      )
      .bind(asset, limit)
      .all(),
    db
      .prepare(
        `SELECT event_index, tx_hash, tx_index, block_index, block_time, source, lp_asset, pair,
                asset_a, asset_b, quantity_destroyed, quantity_a, quantity_b,
                quantity_destroyed_raw, quantity_a_raw, quantity_b_raw, status
         FROM pool_withdrawals
         WHERE lp_asset = ?
         ORDER BY block_time DESC, tx_index DESC
         LIMIT ?`
      )
      .bind(asset, limit)
      .all(),
    db
      .prepare(
        `SELECT event_index, tx_hash, tx_index, block_index, block_time, source, lp_asset, pair,
                asset_a, asset_b, forward_asset, backward_asset,
                forward_quantity, backward_quantity,
                reserve_a_before, reserve_b_before, reserve_a_after, reserve_b_after,
                effective_price, price_before, price_after,
                fee_asset, fee_quantity, fee_bps,
                order_tx_hash, status
         FROM pool_matches
         WHERE lp_asset = ?
         ORDER BY block_time DESC, tx_index DESC
         LIMIT ?`
      )
      .bind(asset, limit)
      .all(),
    db
      .prepare(
        `SELECT b.address, b.holder, b.holder_type, b.owner_address, b.balance, b.balance_raw,
                COALESCE(SUM(CASE WHEN f.fee_asset = ? THEN f.fee_quantity ELSE 0 END), 0) AS implied_fees_a,
                COALESCE(SUM(CASE WHEN f.fee_asset = ? THEN f.fee_quantity ELSE 0 END), 0) AS implied_fees_b
         FROM pool_lp_balances b
         LEFT JOIN pool_address_fee_totals f
           ON f.lp_asset = b.lp_asset AND f.holder = b.holder
         WHERE b.lp_asset = ? AND b.balance_raw > 0
         GROUP BY b.address, b.holder, b.holder_type, b.owner_address, b.balance, b.balance_raw
         ORDER BY b.balance_raw DESC
         LIMIT ?`
      )
      .bind(pool.asset_a, pool.asset_b, asset, holdersLimit)
      .all(),
    db
      .prepare(
        `SELECT COALESCE(SUM(balance_raw), 0) AS total_lp_supply_raw,
                COALESCE(SUM(balance), 0) AS total_lp_supply
         FROM pool_lp_balances
         WHERE lp_asset = ?`
      )
      .bind(asset)
      .first<{ total_lp_supply_raw: number; total_lp_supply: number }>(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN fee_asset = ? AND block_time >= ? THEN fee_quantity ELSE 0 END), 0) AS fees_24h_a,
           COALESCE(SUM(CASE WHEN fee_asset = ? AND block_time >= ? THEN fee_quantity ELSE 0 END), 0) AS fees_24h_b,
           COALESCE(SUM(CASE WHEN fee_asset = ? AND block_time >= ? THEN fee_quantity ELSE 0 END), 0) AS fees_7d_a,
           COALESCE(SUM(CASE WHEN fee_asset = ? AND block_time >= ? THEN fee_quantity ELSE 0 END), 0) AS fees_7d_b,
           COALESCE(SUM(CASE WHEN fee_asset = ? AND block_time >= ? THEN fee_quantity ELSE 0 END), 0) AS fees_30d_a,
           COALESCE(SUM(CASE WHEN fee_asset = ? AND block_time >= ? THEN fee_quantity ELSE 0 END), 0) AS fees_30d_b
         FROM pool_matches
         WHERE lp_asset = ? AND status IN ('valid', 'completed')`
      )
      .bind(
        pool.asset_a,
        dayAgo,
        pool.asset_b,
        dayAgo,
        pool.asset_a,
        weekAgo,
        pool.asset_b,
        weekAgo,
        pool.asset_a,
        monthAgo,
        pool.asset_b,
        monthAgo,
        asset
      )
      .first<{
        fees_24h_a: number;
        fees_24h_b: number;
        fees_7d_a: number;
        fees_7d_b: number;
        fees_30d_a: number;
        fees_30d_b: number;
      }>(),
  ]);

  const baseFees24h = displayPool.display_base_asset === pool.asset_a ? feeWindows?.fees_24h_a ?? 0 : feeWindows?.fees_24h_b ?? 0;
  const quoteFees24h = displayPool.display_quote_asset === pool.asset_a ? feeWindows?.fees_24h_a ?? 0 : feeWindows?.fees_24h_b ?? 0;
  const baseFees7d = displayPool.display_base_asset === pool.asset_a ? feeWindows?.fees_7d_a ?? 0 : feeWindows?.fees_7d_b ?? 0;
  const quoteFees7d = displayPool.display_quote_asset === pool.asset_a ? feeWindows?.fees_7d_a ?? 0 : feeWindows?.fees_7d_b ?? 0;
  const baseFees30d = displayPool.display_base_asset === pool.asset_a ? feeWindows?.fees_30d_a ?? 0 : feeWindows?.fees_30d_b ?? 0;
  const quoteFees30d = displayPool.display_quote_asset === pool.asset_a ? feeWindows?.fees_30d_a ?? 0 : feeWindows?.fees_30d_b ?? 0;

  const poolWithApy = {
    ...displayPool,
    fees_24h_a: feeWindows?.fees_24h_a ?? 0,
    fees_24h_b: feeWindows?.fees_24h_b ?? 0,
    fees_7d_a: feeWindows?.fees_7d_a ?? 0,
    fees_7d_b: feeWindows?.fees_7d_b ?? 0,
    fees_30d_a: feeWindows?.fees_30d_a ?? 0,
    fees_30d_b: feeWindows?.fees_30d_b ?? 0,
    implied_fees_24h_a: feeWindows?.fees_24h_a ?? 0,
    implied_fees_24h_b: feeWindows?.fees_24h_b ?? 0,
    implied_fees_7d_a: feeWindows?.fees_7d_a ?? 0,
    implied_fees_7d_b: feeWindows?.fees_7d_b ?? 0,
    implied_fees_30d_a: feeWindows?.fees_30d_a ?? 0,
    implied_fees_30d_b: feeWindows?.fees_30d_b ?? 0,
    display_fees_24h_base: baseFees24h,
    display_fees_24h_quote: quoteFees24h,
    display_fees_7d_base: baseFees7d,
    display_fees_7d_quote: quoteFees7d,
    display_fees_30d_base: baseFees30d,
    display_fees_30d_quote: quoteFees30d,
    display_implied_fees_24h_base: baseFees24h,
    display_implied_fees_24h_quote: quoteFees24h,
    display_implied_fees_7d_base: baseFees7d,
    display_implied_fees_7d_quote: quoteFees7d,
    display_implied_fees_30d_base: baseFees30d,
    display_implied_fees_30d_quote: quoteFees30d,
    implied_fee_apy_24h: calculateFeeApy(
      calculatePoolFeePeriodReturnInQuote(
        displayPool.display_base_reserve,
        displayPool.display_quote_reserve,
        baseFees24h,
        quoteFees24h
      ),
      24 * 60 * 60
    ),
    implied_fee_apy_7d: calculateFeeApy(
      calculatePoolFeePeriodReturnInQuote(
        displayPool.display_base_reserve,
        displayPool.display_quote_reserve,
        baseFees7d,
        quoteFees7d
      ),
      7 * 24 * 60 * 60
    ),
    implied_fee_apy_30d: calculateFeeApy(
      calculatePoolFeePeriodReturnInQuote(
        displayPool.display_base_reserve,
        displayPool.display_quote_reserve,
        baseFees30d,
        quoteFees30d
      ),
      30 * 24 * 60 * 60
    ),
  };

  return Response.json(
    {
      pool: poolWithApy,
      total_lp_supply_raw: supply?.total_lp_supply_raw ?? 0,
      total_lp_supply: supply?.total_lp_supply ?? 0,
      holders: holders.results,
      deposits: deposits.results,
      withdrawals: withdrawals.results,
      matches: matches.results,
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}

export async function handlePoolAddress(
  url: URL,
  db: D1Database,
  lpAsset: string,
  address: string
): Promise<Response> {
  const asset = lpAsset.toUpperCase();
  const pool = await db
    .prepare(
      `SELECT lp_asset, pair, asset_a, asset_b, reserve_a, reserve_b,
              reserve_a_raw, reserve_b_raw, total_fees_a, total_fees_b, restart_count
       FROM pools
       WHERE lp_asset = ?`
    )
    .bind(asset)
    .first<{
      lp_asset: string;
      pair: string;
      asset_a: string;
      asset_b: string;
      reserve_a: number;
      reserve_b: number;
      reserve_a_raw: number;
      reserve_b_raw: number;
      total_fees_a: number;
      total_fees_b: number;
      restart_count: number;
    }>();

  if (!pool) {
    return Response.json({ error: "Pool not found" }, { status: 404 });
  }

  const displayPool = withPoolDisplay(pool);

  const [balance, supply, deposits, withdrawals, fees, nonDepositLpEvents] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(balance), 0) AS balance,
                COALESCE(SUM(balance_raw), 0) AS balance_raw,
                MAX(updated_block_index) AS updated_block_index,
                MAX(updated_block_time) AS updated_block_time
         FROM pool_lp_balances
         WHERE lp_asset = ? AND (owner_address = ? OR address = ?)`
      )
      .bind(asset, address, address)
      .first<PoolBalanceAggregate>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(balance_raw), 0) AS total_lp_supply_raw,
                COALESCE(SUM(balance), 0) AS total_lp_supply
         FROM pool_lp_balances
         WHERE lp_asset = ?`
      )
      .bind(asset)
      .first<{ total_lp_supply_raw: number; total_lp_supply: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(quantity_a), 0) AS deposited_a,
                COALESCE(SUM(quantity_b), 0) AS deposited_b,
                COALESCE(SUM(quantity_minted), 0) AS minted_lp
         FROM pool_deposits
         WHERE lp_asset = ? AND source = ? AND status = 'valid'`
      )
      .bind(asset, address)
      .first<{ deposited_a: number; deposited_b: number; minted_lp: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(quantity_a), 0) AS withdrawn_a,
                COALESCE(SUM(quantity_b), 0) AS withdrawn_b,
                COALESCE(SUM(quantity_destroyed), 0) AS burned_lp
         FROM pool_withdrawals
         WHERE lp_asset = ? AND source = ? AND status = 'valid'`
      )
      .bind(asset, address)
      .first<{ withdrawn_a: number; withdrawn_b: number; burned_lp: number }>(),
    db
      .prepare(
        `SELECT fee_asset,
                COALESCE(SUM(fee_quantity), 0) AS fee_quantity,
                COALESCE(SUM(fee_quantity_raw), 0) AS fee_quantity_raw
         FROM pool_address_fee_totals
         WHERE lp_asset = ? AND (owner_address = ? OR address = ?)
         GROUP BY fee_asset
         ORDER BY fee_asset`
      )
      .bind(asset, address, address)
      .all(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM pool_lp_balance_events
         WHERE lp_asset = ?
           AND (owner_address = ? OR address = ?)
           AND reason NOT IN ('pool deposit', 'pool withdraw')`
      )
      .bind(asset, address, address)
      .first<{ count: number }>(),
  ]);

  const positionCaveats: string[] = [];
  if ((nonDepositLpEvents?.count ?? 0) > 0) {
    positionCaveats.push("lp_balance_changed_outside_pool_deposit_withdraw");
  }
  if (pool.restart_count > 0) {
    positionCaveats.push("pool_restarted");
  }

  const balanceRaw = balance?.balance_raw ?? 0;
  const totalSupplyRaw = supply?.total_lp_supply_raw ?? 0;
  const ownership = totalSupplyRaw > 0 ? balanceRaw / totalSupplyRaw : 0;
  const claimA = pool.reserve_a * ownership;
  const claimB = pool.reserve_b * ownership;
  const netDepositedA = (deposits?.deposited_a ?? 0) - (withdrawals?.withdrawn_a ?? 0);
  const netDepositedB = (deposits?.deposited_b ?? 0) - (withdrawals?.withdrawn_b ?? 0);
  const claimDisplay = displayAmounts(displayPool, claimA, claimB);
  const netDepositedDisplay = displayAmounts(displayPool, netDepositedA, netDepositedB);
  const claimVsDepositsDisplay = displayAmounts(
    displayPool,
    claimA - netDepositedA,
    claimB - netDepositedB
  );
  const poolPriceInQuote = displayPool.display_price;
  const claimValueInQuote = valueDisplayAmountsInQuote(claimDisplay, poolPriceInQuote);
  const holdValueInQuote = valueDisplayAmountsInQuote(netDepositedDisplay, poolPriceInQuote);
  const divergenceValueInQuote = claimValueInQuote != null && holdValueInQuote != null
    ? claimValueInQuote - holdValueInQuote
    : null;
  const divergencePct = divergenceValueInQuote != null && holdValueInQuote != null && holdValueInQuote > 0
    ? divergenceValueInQuote / holdValueInQuote
    : null;

  return Response.json(
    {
      pool: displayPool,
      address,
      balance: balance ?? { balance: 0, balance_raw: 0, updated_block_index: null, updated_block_time: null },
      total_lp_supply_raw: totalSupplyRaw,
      total_lp_supply: supply?.total_lp_supply ?? 0,
      ownership,
      claim: {
        [pool.asset_a]: claimA,
        [pool.asset_b]: claimB,
      },
      net_deposited: {
        [pool.asset_a]: netDepositedA,
        [pool.asset_b]: netDepositedB,
      },
      claim_vs_deposits: {
        [pool.asset_a]: claimA - netDepositedA,
        [pool.asset_b]: claimB - netDepositedB,
      },
      position_delta: {
        [pool.asset_a]: claimA - netDepositedA,
        [pool.asset_b]: claimB - netDepositedB,
      },
      display_claim: claimDisplay,
      display_net_deposited: netDepositedDisplay,
      display_claim_vs_deposits: claimVsDepositsDisplay,
      display_position_delta: claimVsDepositsDisplay,
      hodl_comparison: {
        quote_asset: displayPool.display_quote_asset,
        pool_price_in_quote: poolPriceInQuote,
        claim_value_in_quote: claimValueInQuote,
        hold_value_in_quote: holdValueInQuote,
        divergence_value_in_quote: divergenceValueInQuote,
        divergence_pct: divergencePct,
      },
      position_basis: {
        type: "deposit_basis_estimate",
        caveats: positionCaveats,
      },
      deposits,
      withdrawals,
      fees: fees.results,
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}

export async function handleAddressPools(
  url: URL,
  db: D1Database,
  address: string
): Promise<Response> {
  const rows = await db
    .prepare(
      `SELECT p.lp_asset, p.pair, p.asset_a, p.asset_b,
              p.reserve_a, p.reserve_b,
              b.balance,
              b.balance_raw,
              COALESCE(s.total_lp_supply_raw, 0) AS total_lp_supply_raw,
              COALESCE(s.total_lp_supply, 0) AS total_lp_supply,
              COALESCE(fa.fee_quantity, 0) AS implied_fees_a,
              COALESCE(fb.fee_quantity, 0) AS implied_fees_b
       FROM (
         SELECT lp_asset, SUM(balance) AS balance, SUM(balance_raw) AS balance_raw
         FROM pool_lp_balances
         WHERE (owner_address = ? OR address = ?) AND balance_raw > 0
         GROUP BY lp_asset
       ) b
       JOIN pools p ON p.lp_asset = b.lp_asset
       LEFT JOIN (
         SELECT lp_asset, SUM(balance_raw) AS total_lp_supply_raw, SUM(balance) AS total_lp_supply
         FROM pool_lp_balances
         GROUP BY lp_asset
       ) s ON s.lp_asset = b.lp_asset
       LEFT JOIN (
         SELECT lp_asset, fee_asset, SUM(fee_quantity) AS fee_quantity
         FROM pool_address_fee_totals
         WHERE owner_address = ? OR address = ?
         GROUP BY lp_asset, fee_asset
       ) fa ON fa.lp_asset = b.lp_asset AND fa.fee_asset = p.asset_a
       LEFT JOIN (
         SELECT lp_asset, fee_asset, SUM(fee_quantity) AS fee_quantity
         FROM pool_address_fee_totals
         WHERE owner_address = ? OR address = ?
         GROUP BY lp_asset, fee_asset
       ) fb ON fb.lp_asset = b.lp_asset AND fb.fee_asset = p.asset_b
       ORDER BY balance_raw DESC`
    )
    .bind(address, address, address, address, address, address)
    .all<AddressPoolRow>();

  return Response.json(
    { address, pools: rows.results.map(withPoolDisplay) },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}
