import { makePoolPair, sortPoolAssets } from "../lib/pools";
import { eventQuantity, parseQuantity } from "../lib/quantity";

export interface PoolEventResult {
  stmt: (db: D1Database) => D1PreparedStatement;
  lpAsset: string;
  pair: string;
}

export interface PoolMatchExecutionContext {
  reserveABefore: number | null;
  reserveBBefore: number | null;
  reserveAAfter: number | null;
  reserveBAfter: number | null;
  effectivePrice: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
}

export async function findPoolLpAsset(
  db: D1Database,
  assetA: string,
  assetB: string
): Promise<string | null> {
  const pair = makePoolPair(assetA, assetB);
  const row = await db
    .prepare(`SELECT lp_asset FROM pools WHERE pair = ?`)
    .bind(pair)
    .first<{ lp_asset: string }>();
  return row?.lp_asset ?? null;
}

export async function findPoolPairByLpAsset(
  db: D1Database,
  lpAsset: string
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT pair FROM pools WHERE lp_asset = ?`)
    .bind(lpAsset)
    .first<{ pair: string }>();
  return row?.pair ?? null;
}

export async function refreshPoolAggregates(db: D1Database, lpAsset: string): Promise<void> {
  await db
    .prepare(
      `UPDATE pools
       SET deposit_count = (SELECT COUNT(*) FROM pool_deposits WHERE lp_asset = ? AND status = 'valid'),
           withdrawal_count = (SELECT COUNT(*) FROM pool_withdrawals WHERE lp_asset = ? AND status = 'valid'),
           match_count = (SELECT COUNT(*) FROM pool_matches WHERE lp_asset = ? AND status IN ('valid', 'completed')),
           restart_count = (SELECT COUNT(*) FROM pool_deposits WHERE lp_asset = ? AND status = 'valid' AND is_restart = 1),
           total_fees_a_raw = COALESCE((SELECT SUM(fee_quantity_raw) FROM pool_matches WHERE lp_asset = ? AND fee_asset = pools.asset_a AND status IN ('valid', 'completed')), 0),
           total_fees_b_raw = COALESCE((SELECT SUM(fee_quantity_raw) FROM pool_matches WHERE lp_asset = ? AND fee_asset = pools.asset_b AND status IN ('valid', 'completed')), 0),
           total_fees_a = COALESCE((SELECT SUM(fee_quantity) FROM pool_matches WHERE lp_asset = ? AND fee_asset = pools.asset_a AND status IN ('valid', 'completed')), 0),
           total_fees_b = COALESCE((SELECT SUM(fee_quantity) FROM pool_matches WHERE lp_asset = ? AND fee_asset = pools.asset_b AND status IN ('valid', 'completed')), 0)
       WHERE lp_asset = ?`
    )
    .bind(lpAsset, lpAsset, lpAsset, lpAsset, lpAsset, lpAsset, lpAsset, lpAsset, lpAsset)
    .run();
}

export async function rebuildPoolFromHistory(db: D1Database, lpAsset: string): Promise<void> {
  const latest = await db
    .prepare(
      `SELECT * FROM pool_updates
       WHERE lp_asset = ?
       ORDER BY block_index DESC, id DESC
       LIMIT 1`
    )
    .bind(lpAsset)
    .first<{
      tx_hash: string;
      block_index: number;
      block_time: number;
      lp_asset: string;
      pair: string;
      asset_a: string;
      asset_b: string;
      reserve_a_raw: number;
      reserve_b_raw: number;
      reserve_a: number;
      reserve_b: number;
    }>();

  if (!latest) {
    await db.prepare(`DELETE FROM pools WHERE lp_asset = ?`).bind(lpAsset).run();
    return;
  }

  const opened = await db
    .prepare(
      `SELECT tx_hash, block_index, block_time
       FROM pool_updates
       WHERE lp_asset = ? AND event = 'OPEN_POOL'
       ORDER BY block_index ASC, id ASC
       LIMIT 1`
    )
    .bind(lpAsset)
    .first<{ tx_hash: string; block_index: number; block_time: number }>();

  await db
    .prepare(
      `INSERT INTO pools (
         lp_asset, pair, asset_a, asset_b,
         reserve_a_raw, reserve_b_raw, reserve_a, reserve_b,
         opened_tx_hash, opened_block_index, opened_block_time,
         last_tx_hash, last_block_index, last_block_time, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(lp_asset) DO UPDATE SET
         pair = excluded.pair,
         asset_a = excluded.asset_a,
         asset_b = excluded.asset_b,
         reserve_a_raw = excluded.reserve_a_raw,
         reserve_b_raw = excluded.reserve_b_raw,
         reserve_a = excluded.reserve_a,
         reserve_b = excluded.reserve_b,
         opened_tx_hash = COALESCE(pools.opened_tx_hash, excluded.opened_tx_hash),
         opened_block_index = COALESCE(pools.opened_block_index, excluded.opened_block_index),
         opened_block_time = COALESCE(pools.opened_block_time, excluded.opened_block_time),
         last_tx_hash = excluded.last_tx_hash,
         last_block_index = excluded.last_block_index,
         last_block_time = excluded.last_block_time,
         updated_at = excluded.updated_at`
    )
    .bind(
      latest.lp_asset,
      latest.pair,
      latest.asset_a,
      latest.asset_b,
      latest.reserve_a_raw,
      latest.reserve_b_raw,
      latest.reserve_a,
      latest.reserve_b,
      opened?.tx_hash ?? latest.tx_hash,
      opened?.block_index ?? latest.block_index,
      opened?.block_time ?? latest.block_time,
      latest.tx_hash,
      latest.block_index,
      latest.block_time,
      Math.floor(Date.now() / 1000)
    )
    .run();

  await refreshPoolAggregates(db, lpAsset);
}

export function processOpenPool(
  params: Record<string, unknown>,
  eventIndex: number,
  blockIndex: number,
  blockTime: number
): PoolEventResult | null {
  const rawAssetA = params.asset_a as string | undefined;
  const rawAssetB = params.asset_b as string | undefined;
  const lpAsset = params.lp_asset as string | undefined;
  const txHash = params.tx_hash as string | undefined;
  if (!rawAssetA || !rawAssetB || !lpAsset || !txHash) return null;

  const [assetA, assetB] = sortPoolAssets(rawAssetA, rawAssetB);
  const pair = makePoolPair(assetA, assetB);

  return {
    lpAsset,
    pair,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO pool_updates
           (event, event_index, tx_hash, tx_index, block_index, block_time, lp_asset, pair, asset_a, asset_b,
            reserve_a_raw, reserve_b_raw, reserve_a, reserve_b)
           VALUES ('OPEN_POOL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          eventIndex,
          txHash,
          (params.tx_index as number | undefined) ?? null,
          blockIndex,
          blockTime,
          lpAsset,
          pair,
          assetA,
          assetB,
          parseQuantity(params.reserve_a),
          parseQuantity(params.reserve_b),
          eventQuantity(params, "reserve_a_normalized", "reserve_a", "asset_a_info"),
          eventQuantity(params, "reserve_b_normalized", "reserve_b", "asset_b_info")
        ),
  };
}

export function buildPoolSnapshotStmt(
  params: Record<string, unknown>,
  now: number
): PoolEventResult | null {
  const rawAssetA = params.asset_a as string | undefined;
  const rawAssetB = params.asset_b as string | undefined;
  const lpAsset = params.lp_asset as string | undefined;
  if (!rawAssetA || !rawAssetB || !lpAsset) return null;

  const [assetA, assetB] = sortPoolAssets(rawAssetA, rawAssetB);
  const pair = makePoolPair(assetA, assetB);
  const blockIndex = params.block_index != null ? parseQuantity(params.block_index) : null;
  const blockTime = params.block_time != null ? parseQuantity(params.block_time) : null;
  const txHash = (params.tx_hash as string | undefined) ?? null;

  return {
    lpAsset,
    pair,
    stmt: (db) =>
      db
        .prepare(
          `INSERT INTO pools (
             lp_asset, pair, asset_a, asset_b,
             reserve_a_raw, reserve_b_raw, reserve_a, reserve_b,
             opened_tx_hash, opened_block_index, opened_block_time,
             last_tx_hash, last_block_index, last_block_time, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(lp_asset) DO UPDATE SET
             pair = excluded.pair,
             asset_a = excluded.asset_a,
             asset_b = excluded.asset_b,
             reserve_a_raw = excluded.reserve_a_raw,
             reserve_b_raw = excluded.reserve_b_raw,
             reserve_a = excluded.reserve_a,
             reserve_b = excluded.reserve_b,
             last_tx_hash = COALESCE(excluded.last_tx_hash, pools.last_tx_hash),
             last_block_index = COALESCE(NULLIF(excluded.last_block_index, 0), pools.last_block_index),
             last_block_time = COALESCE(excluded.last_block_time, pools.last_block_time),
             updated_at = excluded.updated_at`
        )
        .bind(
          lpAsset,
          pair,
          assetA,
          assetB,
          parseQuantity(params.reserve_a),
          parseQuantity(params.reserve_b),
          eventQuantity(params, "reserve_a_normalized", "reserve_a", "asset_a_info"),
          eventQuantity(params, "reserve_b_normalized", "reserve_b", "asset_b_info"),
          txHash,
          blockIndex,
          blockTime,
          txHash,
          blockIndex,
          blockTime,
          now
        ),
  };
}

export function processPoolUpdate(
  params: Record<string, unknown>,
  lpAsset: string,
  eventIndex: number,
  blockIndex: number,
  blockTime: number
): PoolEventResult | null {
  const rawAssetA = params.asset_a as string | undefined;
  const rawAssetB = params.asset_b as string | undefined;
  const txHash = params.tx_hash as string | undefined;
  if (!rawAssetA || !rawAssetB || !txHash) return null;

  const [assetA, assetB] = sortPoolAssets(rawAssetA, rawAssetB);
  const pair = makePoolPair(assetA, assetB);

  return {
    lpAsset,
    pair,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO pool_updates
           (event, event_index, tx_hash, tx_index, block_index, block_time, lp_asset, pair, asset_a, asset_b,
            reserve_a_raw, reserve_b_raw, reserve_a, reserve_b)
           VALUES ('POOL_UPDATE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          eventIndex,
          txHash,
          (params.tx_index as number | undefined) ?? null,
          blockIndex,
          blockTime,
          lpAsset,
          pair,
          assetA,
          assetB,
          parseQuantity(params.reserve_a),
          parseQuantity(params.reserve_b),
          eventQuantity(params, "reserve_a_normalized", "reserve_a", "asset_a_info"),
          eventQuantity(params, "reserve_b_normalized", "reserve_b", "asset_b_info")
        ),
  };
}

export function processPoolDeposit(
  params: Record<string, unknown>,
  lpAsset: string,
  eventIndex: number,
  blockIndex: number,
  blockTime: number,
  isRestart: boolean = false
): PoolEventResult | null {
  const rawAssetA = params.asset_a as string | undefined;
  const rawAssetB = params.asset_b as string | undefined;
  const txHash = params.tx_hash as string | undefined;
  const source = params.source as string | undefined;
  if (!rawAssetA || !rawAssetB || !txHash || !source) return null;

  const [assetA, assetB] = sortPoolAssets(rawAssetA, rawAssetB);
  const pair = makePoolPair(assetA, assetB);

  return {
    lpAsset,
    pair,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO pool_deposits
           (tx_hash, event_index, tx_index, block_index, block_time, source, lp_asset, pair, asset_a, asset_b,
             quantity_a_raw, quantity_b_raw, quantity_minted_raw, quantity_a, quantity_b, quantity_minted, is_restart, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          txHash,
          eventIndex,
          (params.tx_index as number | undefined) ?? null,
          blockIndex,
          blockTime,
          source,
          lpAsset,
          pair,
          assetA,
          assetB,
          parseQuantity(params.quantity_a),
          parseQuantity(params.quantity_b),
          parseQuantity(params.quantity_minted),
          eventQuantity(params, "quantity_a_normalized", "quantity_a", "asset_a_info"),
          eventQuantity(params, "quantity_b_normalized", "quantity_b", "asset_b_info"),
          eventQuantity(params, "quantity_minted_normalized", "quantity_minted", "lp_asset_info"),
          isRestart ? 1 : 0,
          (params.status as string | undefined) ?? "valid"
        ),
  };
}

export function processPoolWithdrawal(
  params: Record<string, unknown>,
  lpAsset: string,
  eventIndex: number,
  blockIndex: number,
  blockTime: number
): PoolEventResult | null {
  const rawAssetA = params.asset_a as string | undefined;
  const rawAssetB = params.asset_b as string | undefined;
  const txHash = params.tx_hash as string | undefined;
  const source = params.source as string | undefined;
  if (!rawAssetA || !rawAssetB || !txHash || !source) return null;

  const [assetA, assetB] = sortPoolAssets(rawAssetA, rawAssetB);
  const pair = makePoolPair(assetA, assetB);

  return {
    lpAsset,
    pair,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO pool_withdrawals
           (tx_hash, event_index, tx_index, block_index, block_time, source, lp_asset, pair, asset_a, asset_b,
            quantity_destroyed_raw, quantity_a_raw, quantity_b_raw, quantity_destroyed, quantity_a, quantity_b, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          txHash,
          eventIndex,
          (params.tx_index as number | undefined) ?? null,
          blockIndex,
          blockTime,
          source,
          lpAsset,
          pair,
          assetA,
          assetB,
          parseQuantity(params.quantity_destroyed),
          parseQuantity(params.quantity_a),
          parseQuantity(params.quantity_b),
          eventQuantity(params, "quantity_destroyed_normalized", "quantity_destroyed", "lp_asset_info"),
          eventQuantity(params, "quantity_a_normalized", "quantity_a", "asset_a_info"),
          eventQuantity(params, "quantity_b_normalized", "quantity_b", "asset_b_info"),
          (params.status as string | undefined) ?? "valid"
        ),
  };
}

export function processPoolMatch(
  params: Record<string, unknown>,
  lpAsset: string,
  eventIndex: number,
  blockIndex: number,
  blockTime: number,
  executionContext?: PoolMatchExecutionContext
): PoolEventResult | null {
  const rawAssetA = params.asset_a as string | undefined;
  const rawAssetB = params.asset_b as string | undefined;
  const txHash = params.tx_hash as string | undefined;
  const source = params.source as string | undefined;
  const forwardAsset = params.forward_asset as string | undefined;
  const backwardAsset = params.backward_asset as string | undefined;
  if (!rawAssetA || !rawAssetB || !txHash || !source || !forwardAsset || !backwardAsset) return null;

  const [assetA, assetB] = sortPoolAssets(rawAssetA, rawAssetB);
  const pair = makePoolPair(assetA, assetB);

  return {
    lpAsset,
    pair,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO pool_matches
           (event_index, tx_hash, tx_index, block_index, block_time, source, lp_asset, pair, asset_a, asset_b,
             forward_asset, backward_asset, forward_quantity_raw, backward_quantity_raw,
             forward_quantity, backward_quantity,
             reserve_a_before, reserve_b_before, reserve_a_after, reserve_b_after,
             effective_price, price_before, price_after,
             fee_asset, fee_quantity_raw, fee_quantity,
             fee_bps, order_tx_hash, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          eventIndex,
          txHash,
          (params.tx_index as number | undefined) ?? null,
          blockIndex,
          blockTime,
          source,
          lpAsset,
          pair,
          assetA,
          assetB,
          forwardAsset,
          backwardAsset,
          parseQuantity(params.forward_quantity),
          parseQuantity(params.backward_quantity),
          eventQuantity(params, "forward_quantity_normalized", "forward_quantity", "forward_asset_info"),
          eventQuantity(params, "backward_quantity_normalized", "backward_quantity", "backward_asset_info"),
          executionContext?.reserveABefore ?? null,
          executionContext?.reserveBBefore ?? null,
          executionContext?.reserveAAfter ?? null,
          executionContext?.reserveBAfter ?? null,
          executionContext?.effectivePrice ?? null,
          executionContext?.priceBefore ?? null,
          executionContext?.priceAfter ?? null,
          backwardAsset,
          parseQuantity(params.fee_quantity),
          eventQuantity(params, "fee_quantity_normalized", "fee_quantity", "backward_asset_info"),
          parseQuantity(params.fee_bps),
          (params.order_tx_hash as string | undefined) ?? null,
          (params.status as string | undefined) ?? "valid"
        ),
  };
}
