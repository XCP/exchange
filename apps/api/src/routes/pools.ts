import { cacheControl } from "../utils/cache";
import { orientPoolDisplay } from "../lib/pools";

const VALID_POOL_SORTS = new Set([
  "match_count",
  "deposit_count",
  "withdrawal_count",
  "last_block_time",
  "opened_block_time",
  "implied_fee_apr_30d",
]);

const POOL_SORT_SQL: Record<string, string> = {
  match_count: "p.match_count",
  deposit_count: "p.deposit_count",
  withdrawal_count: "p.withdrawal_count",
  last_block_time: "p.last_block_time",
  opened_block_time: "p.opened_block_time",
  implied_fee_apr_30d: "implied_fee_apr_30d",
};

const YEAR_SECONDS = 365 * 24 * 60 * 60;

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
  fees_30d_a: number;
  fees_30d_b: number;
  implied_fee_apr_30d: number | null;
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

function calculatePoolFeeAprInQuote(
  baseReserve: number,
  quoteReserve: number,
  baseFees: number,
  quoteFees: number,
  windowSeconds: number
): number | null {
  if (baseReserve <= 0 || quoteReserve <= 0 || windowSeconds <= 0) return null;
  const price = quoteReserve / baseReserve;
  const feeValueInQuote = quoteFees + baseFees * price;
  const poolValueInQuote = quoteReserve + baseReserve * price;
  const periodReturn = poolValueInQuote > 0 ? feeValueInQuote / poolValueInQuote : 0;
  return periodReturn * (YEAR_SECONDS / windowSeconds);
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
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );
  const now = Math.floor(Date.now() / 1000);
  const monthAgo = now - 30 * 24 * 60 * 60;

  let query = `SELECT
    p.lp_asset, p.pair, p.asset_a, p.asset_b,
    p.reserve_a, p.reserve_b, p.reserve_a_raw, p.reserve_b_raw,
    p.opened_tx_hash, p.opened_block_index, p.opened_block_time,
    p.last_tx_hash, p.last_block_index, p.last_block_time,
    p.deposit_count, p.withdrawal_count, p.match_count, p.restart_count,
    p.total_fees_a, p.total_fees_b, p.total_fees_a_raw, p.total_fees_b_raw,
    p.updated_at,
    COALESCE(f.fees_30d_a, 0) AS fees_30d_a,
    COALESCE(f.fees_30d_b, 0) AS fees_30d_b,
    CASE
      WHEN p.reserve_a > 0 AND p.reserve_b > 0
      THEN (
        (COALESCE(f.fees_30d_b, 0) + COALESCE(f.fees_30d_a, 0) * (p.reserve_b / p.reserve_a))
        / (p.reserve_b + p.reserve_a * (p.reserve_b / p.reserve_a))
      ) * ?
      ELSE NULL
    END AS implied_fee_apr_30d
  FROM pools p
  LEFT JOIN (
    SELECT lp_asset,
           SUM(CASE WHEN fee_asset = asset_a THEN fee_quantity ELSE 0 END) AS fees_30d_a,
           SUM(CASE WHEN fee_asset = asset_b THEN fee_quantity ELSE 0 END) AS fees_30d_b
    FROM pool_matches
    WHERE status IN ('valid', 'completed') AND block_time >= ?
    GROUP BY lp_asset
  ) f ON f.lp_asset = p.lp_asset`;
  let countQuery = `SELECT COUNT(*) AS total FROM pools`;
  const binds: (string | number)[] = [YEAR_SECONDS / (30 * 24 * 60 * 60), monthAgo];
  const countBinds: (string | number)[] = [];

  if (asset) {
    query += ` WHERE p.asset_a = ? OR p.asset_b = ? OR p.lp_asset = ?`;
    countQuery += ` WHERE asset_a = ? OR asset_b = ? OR lp_asset = ?`;
    binds.push(asset, asset, asset);
    countBinds.push(asset, asset, asset);
  }

  query += ` ORDER BY ${POOL_SORT_SQL[sort]} ${order}, p.lp_asset ASC LIMIT ? OFFSET ?`;

  const [result, countResult] = await Promise.all([
    db.prepare(query).bind(...binds, limit, offset).all<PoolListRow>(),
    db.prepare(countQuery).bind(...countBinds).first<{ total: number }>(),
  ]);

  return Response.json(
    {
      pools: result.results.map((pool) => {
        const displayPool = withPoolDisplay(pool);
        const baseFees30d = displayPool.display_base_asset === pool.asset_a ? pool.fees_30d_a : pool.fees_30d_b;
        const quoteFees30d = displayPool.display_quote_asset === pool.asset_a ? pool.fees_30d_a : pool.fees_30d_b;
        return {
          ...displayPool,
          fees_30d_a: pool.fees_30d_a,
          fees_30d_b: pool.fees_30d_b,
          implied_fees_30d_a: pool.fees_30d_a,
          implied_fees_30d_b: pool.fees_30d_b,
          display_fees_30d_base: baseFees30d,
          display_fees_30d_quote: quoteFees30d,
          display_implied_fees_30d_base: baseFees30d,
          display_implied_fees_30d_quote: quoteFees30d,
          implied_fee_apr_30d: pool.implied_fee_apr_30d,
        };
      }),
      total: countResult?.total ?? 0,
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
                forward_quantity, backward_quantity, fee_asset, fee_quantity, fee_bps,
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

  const poolWithApr = {
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
    implied_fee_apr_24h: calculatePoolFeeAprInQuote(
      displayPool.display_base_reserve,
      displayPool.display_quote_reserve,
      baseFees24h,
      quoteFees24h,
      24 * 60 * 60
    ),
    implied_fee_apr_7d: calculatePoolFeeAprInQuote(
      displayPool.display_base_reserve,
      displayPool.display_quote_reserve,
      baseFees7d,
      quoteFees7d,
      7 * 24 * 60 * 60
    ),
    implied_fee_apr_30d: calculatePoolFeeAprInQuote(
      displayPool.display_base_reserve,
      displayPool.display_quote_reserve,
      baseFees30d,
      quoteFees30d,
      30 * 24 * 60 * 60
    ),
  };

  return Response.json(
    {
      pool: poolWithApr,
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
