import { batchExec } from "../lib/batch";
import { eventQuantity, parseQuantity } from "../lib/quantity";

export type PendingPoolBalances = Map<string, {
  lpAsset: string;
  pair: string;
  address: string;
  holder: string;
  holderType: "address" | "utxo";
  ownerAddress: string | null;
  deltaRaw: number;
  delta: number;
}>;

interface LpDeltaInput {
  event: string;
  txHash: string;
  eventIndex: number;
  txIndex: number | null;
  blockIndex: number;
  blockTime: number;
  lpAsset: string;
  pair: string;
  address: string;
  holder: string;
  holderType: "address" | "utxo";
  ownerAddress: string | null;
  counterparty?: string | null;
  deltaRaw: number;
  delta: number;
  reason: string;
}

interface FeeAllocationInput {
  txHash: string;
  orderTxHash: string | null;
  eventIndex: number;
  blockIndex: number;
  blockTime: number;
  lpAsset: string;
  pair: string;
  feeAsset: string;
  feeQuantityRaw: number;
  feeQuantity: number;
}

interface CreditDebitInput {
  event: "CREDIT" | "DEBIT";
  txHash: string;
  params: Record<string, unknown>;
  eventIndex: number;
  blockIndex: number;
  blockTime: number;
  lpAsset: string;
  pair: string;
}

function balanceKey(lpAsset: string, holder: string): string {
  return `${lpAsset}\u0000${holder}`;
}

function feeShare(feeRaw: number, balanceRaw: number, totalRaw: number): number {
  if (feeRaw <= 0 || balanceRaw <= 0 || totalRaw <= 0) return 0;
  return Number((BigInt(feeRaw) * BigInt(balanceRaw)) / BigInt(totalRaw));
}

// On a partial-block retry, fee allocation and snapshots need the opening
// balance, not the current balance plus the same block's deltas a second time.
export type AppliedPoolBalances = Map<string, {
  lpAsset: string; holder: string; address: string;
  holderType: "address" | "utxo"; ownerAddress: string | null;
  deltaRaw: number; delta: number; balanceRaw: number; balance: number;
}>;

export async function loadAppliedPoolBalances(db: D1Database, blockIndex: number): Promise<AppliedPoolBalances> {
  const rows = await db.prepare(`SELECT e.lp_asset, e.holder,
      SUM(e.delta_raw) AS delta_raw, SUM(e.delta) AS delta,
      b.address, b.holder_type, b.owner_address, b.balance_raw, b.balance
    FROM pool_lp_balance_events e JOIN pool_lp_balances b
      ON b.lp_asset = e.lp_asset AND b.holder = e.holder
    WHERE e.block_index = ? GROUP BY e.lp_asset, e.holder`)
    .bind(blockIndex).all<{
      lp_asset: string; holder: string; address: string;
      holder_type: "address" | "utxo"; owner_address: string | null;
      delta_raw: number; delta: number; balance_raw: number; balance: number;
    }>();
  return new Map(rows.results.map(row => [balanceKey(row.lp_asset, row.holder), {
    lpAsset: row.lp_asset, holder: row.holder, address: row.address,
    holderType: row.holder_type, ownerAddress: row.owner_address,
    deltaRaw: row.delta_raw, delta: row.delta, balanceRaw: row.balance_raw, balance: row.balance,
  }]));
}

interface FeeAllocationRow {
  address: string;
  holder: string;
  holderType: "address" | "utxo";
  ownerAddress: string | null;
  balanceRaw: number;
  balance: number;
}

interface FeeAccrualSource {
  txHash: string;
  orderTxHash: string | null;
  eventIndex: number;
  blockIndex: number;
  blockTime: number;
  lpAsset: string;
  pair: string;
  feeAsset: string;
  feeQuantityRaw: number;
  feeQuantity: number;
}

function buildFeeAccrualStmts(
  db: D1Database,
  input: FeeAccrualSource,
  balances: FeeAllocationRow[]
): { stmts: D1PreparedStatement[]; allocations: number } {
  const positive = balances.filter((row) => row.balanceRaw > 0);
  const totalSupplyRaw = positive.reduce((sum, row) => sum + row.balanceRaw, 0);
  if (!Number.isSafeInteger(totalSupplyRaw)) throw new Error("Unsafe LP fee allocation supply");
  if (input.feeQuantityRaw <= 0 || totalSupplyRaw <= 0) {
    return { stmts: [], allocations: 0 };
  }

  const stmts: D1PreparedStatement[] = [];
  let allocations = 0;
  for (const row of positive) {
    const shareRaw = feeShare(input.feeQuantityRaw, row.balanceRaw, totalSupplyRaw);
    if (shareRaw <= 0) continue;
    const share = input.feeQuantityRaw > 0
      ? input.feeQuantity * (shareRaw / input.feeQuantityRaw)
      : 0;

    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO pool_fee_accruals
         (pool_match_tx_hash, order_tx_hash, event_index, block_index, block_time,
          lp_asset, pair, address, holder, holder_type, owner_address, fee_asset, fee_quantity_raw, fee_quantity,
          lp_balance_raw, total_lp_supply_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.txHash,
          input.orderTxHash,
          input.eventIndex,
          input.blockIndex,
          input.blockTime,
          input.lpAsset,
          input.pair,
          row.address,
          row.holder,
          row.holderType,
          row.ownerAddress,
          input.feeAsset,
          shareRaw,
          share,
          row.balanceRaw,
          totalSupplyRaw,
        )
    );

    allocations++;
  }

  return { stmts, allocations };
}

export function addLpDelta(
  stmts: ((db: D1Database) => D1PreparedStatement)[],
  pendingBalances: PendingPoolBalances,
  input: LpDeltaInput
): void {
  if (!Number.isSafeInteger(input.deltaRaw) || !Number.isFinite(input.delta)) {
    throw new Error("Invalid LP balance delta");
  }
  if (!input.holder || input.deltaRaw === 0) return;

  const key = balanceKey(input.lpAsset, input.holder);
  const existing = pendingBalances.get(key);
  const currentRaw = existing?.deltaRaw ?? 0;
  const current = existing?.delta ?? 0;
  if (!Number.isSafeInteger(currentRaw + input.deltaRaw)) throw new Error("Unsafe LP balance delta total");
  pendingBalances.set(key, {
    lpAsset: input.lpAsset,
    pair: input.pair,
    address: input.address,
    holder: input.holder,
    holderType: input.holderType,
    ownerAddress: input.ownerAddress,
    deltaRaw: currentRaw + input.deltaRaw,
    delta: current + input.delta,
  });

  stmts.push((db) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO pool_lp_balance_events
          (event, tx_hash, event_index, tx_index, block_index, block_time,
           lp_asset, pair, address, holder, holder_type, owner_address, counterparty, delta_raw, delta, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.event,
        input.txHash,
        input.eventIndex,
        input.txIndex,
        input.blockIndex,
        input.blockTime,
        input.lpAsset,
        input.pair,
        input.address,
        input.holder,
        input.holderType,
        input.ownerAddress,
        input.counterparty ?? null,
        input.deltaRaw,
        input.delta,
        input.reason
      )
  );

  // The insert trigger applies the delta atomically only for a new event.
}

export function addCreditDebitLpDelta(
  stmts: ((db: D1Database) => D1PreparedStatement)[],
  pendingBalances: PendingPoolBalances,
  input: CreditDebitInput
): void {
  const quantityRaw = parseQuantity(input.params.quantity);
  if (quantityRaw <= 0) return;

  const eventAddress = input.params.address as string | undefined;
  const utxoAddress = input.params.utxo_address as string | undefined;
  const utxo = input.params.utxo as string | undefined;
  const holder = eventAddress ?? utxo ?? utxoAddress;
  if (!holder) return;
  const holderType = eventAddress ? "address" : "utxo";
  const ownerAddress = eventAddress ?? utxoAddress ?? null;

  const quantity = eventQuantity(input.params, "quantity_normalized", "quantity", "asset_info");
  const sign = input.event === "DEBIT" ? -1 : 1;
  const reason =
    (input.params.calling_function as string | undefined) ??
    (input.params.action as string | undefined) ??
    input.event.toLowerCase();

  addLpDelta(stmts, pendingBalances, {
    event: input.event,
    txHash: input.txHash,
    eventIndex: input.eventIndex,
    txIndex: (input.params.tx_index as number | undefined) ?? null,
    blockIndex: input.blockIndex,
    blockTime: input.blockTime,
    lpAsset: input.lpAsset,
    pair: input.pair,
    address: ownerAddress ?? holder,
    holder,
    holderType,
    ownerAddress,
    counterparty: (input.params.utxo as string | undefined) ?? null,
    deltaRaw: sign * quantityRaw,
    delta: sign * quantity,
    reason,
  });
}

export async function allocatePoolFees(
  db: D1Database,
  stmts: ((db: D1Database) => D1PreparedStatement)[],
  pendingBalances: PendingPoolBalances,
  input: FeeAllocationInput,
  appliedBalances: AppliedPoolBalances = new Map(),
): Promise<number> {
  if (input.feeQuantityRaw <= 0) return 0;

  const rows = await db
    .prepare(
      `SELECT lp_asset, pair, address, holder, holder_type, owner_address, balance_raw, balance
       FROM pool_lp_balances
       WHERE lp_asset = ? AND balance_raw > 0`
    )
    .bind(input.lpAsset)
    .all<{ lp_asset: string; pair: string; address: string; holder: string; holder_type: "address" | "utxo"; owner_address: string | null; balance_raw: number; balance: number }>();

  const balances = new Map<string, { address: string; holder: string; holderType: "address" | "utxo"; ownerAddress: string | null; balanceRaw: number; balance: number }>();
  for (const row of rows.results) {
    balances.set(row.holder, {
      address: row.address,
      holder: row.holder,
      holderType: row.holder_type,
      ownerAddress: row.owner_address,
      balanceRaw: row.balance_raw,
      balance: row.balance,
    });
  }

  for (const applied of appliedBalances.values()) {
    if (applied.lpAsset !== input.lpAsset) continue;
    // Include holders already debited to zero by the interrupted attempt.
    balances.set(applied.holder, {
      ...applied,
      balanceRaw: applied.balanceRaw - applied.deltaRaw,
      balance: applied.balance - applied.delta,
    });
  }

  for (const pending of pendingBalances.values()) {
    if (pending.lpAsset !== input.lpAsset) continue;
    const existing = balances.get(pending.holder);
    balances.set(pending.holder, {
      address: pending.address,
      holder: pending.holder,
      holderType: pending.holderType,
      ownerAddress: pending.ownerAddress,
      balanceRaw: (existing?.balanceRaw ?? 0) + pending.deltaRaw,
      balance: (existing?.balance ?? 0) + pending.delta,
    });
  }

  const allocation = buildFeeAccrualStmts(db, input, [...balances.values()]);
  for (const stmt of allocation.stmts) {
    stmts.push(() => stmt);
  }

  return allocation.allocations;
}

export async function refreshPoolFeeTotals(db: D1Database, lpAsset: string): Promise<void> {
  await db.prepare(`DELETE FROM pool_address_fee_totals WHERE lp_asset = ?`).bind(lpAsset).run();

  const feeRows = await db
    .prepare(
      `SELECT lp_asset, pair, address, holder, holder_type, owner_address, fee_asset,
              SUM(fee_quantity_raw) AS fee_quantity_raw,
              SUM(fee_quantity) AS fee_quantity,
              MAX(block_index) AS updated_block_index,
              MAX(block_time) AS updated_block_time
       FROM pool_fee_accruals
       WHERE lp_asset = ?
       GROUP BY lp_asset, pair, address, holder, holder_type, owner_address, fee_asset`
    )
    .bind(lpAsset)
    .all<{
      lp_asset: string;
      pair: string;
      address: string;
      holder: string;
      holder_type: "address" | "utxo";
      owner_address: string | null;
      fee_asset: string;
      fee_quantity_raw: number;
      fee_quantity: number;
      updated_block_index: number;
      updated_block_time: number;
    }>();

  await batchExec(db, feeRows.results.map((row) =>
    db
      .prepare(
        `INSERT INTO pool_address_fee_totals
         (lp_asset, pair, address, holder, holder_type, owner_address, fee_asset, fee_quantity_raw, fee_quantity, updated_block_index, updated_block_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        row.lp_asset,
        row.pair,
        row.address,
        row.holder,
        row.holder_type,
        row.owner_address,
        row.fee_asset,
        row.fee_quantity_raw,
        row.fee_quantity,
        row.updated_block_index,
        row.updated_block_time
      )
  ));
}


export async function addBalanceSnapshots(
  db: D1Database,
  stmts: ((db: D1Database) => D1PreparedStatement)[],
  pendingBalances: PendingPoolBalances,
  blockIndex: number,
  blockTime: number,
  appliedBalances: AppliedPoolBalances = new Map(),
): Promise<void> {
  if (pendingBalances.size === 0) return;

  for (const pending of pendingBalances.values()) {
    const current = await db
      .prepare(
        `SELECT balance_raw, balance
         FROM pool_lp_balances
         WHERE lp_asset = ? AND holder = ?`
      )
      .bind(pending.lpAsset, pending.holder)
      .first<{ balance_raw: number; balance: number }>();

    const applied = appliedBalances.get(balanceKey(pending.lpAsset, pending.holder));
    const balanceRaw = (current?.balance_raw ?? 0) - (applied?.deltaRaw ?? 0) + pending.deltaRaw;
    const balance = (current?.balance ?? 0) - (applied?.delta ?? 0) + pending.delta;

    stmts.push((stmtDb) =>
      stmtDb
        .prepare(
          `INSERT OR REPLACE INTO pool_lp_balance_snapshots
           (lp_asset, pair, address, holder, holder_type, owner_address, block_index, block_time, balance_raw, balance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          pending.lpAsset,
          pending.pair,
          pending.address,
          pending.holder,
          pending.holderType,
          pending.ownerAddress,
          blockIndex,
          blockTime,
          balanceRaw,
          balance
        )
    );
  }
}

export async function prunePoolBalanceSnapshots(
  db: D1Database,
  currentBlock: number,
  retentionBlocks: number = 100
): Promise<void> {
  const cutoff = currentBlock - retentionBlocks;
  if (cutoff <= 0) return;

  await db
    .prepare(
      `DELETE FROM pool_lp_balance_snapshots
       WHERE block_index < ?
         AND block_index NOT IN (
           SELECT MAX(block_index)
           FROM pool_lp_balance_snapshots
           WHERE block_index < ?
            GROUP BY lp_asset, holder
         )`
    )
    .bind(cutoff, cutoff)
    .run();
}
