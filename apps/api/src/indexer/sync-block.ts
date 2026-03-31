import { OrderMatch, Order, CounterpartyDispenser, fetchOrderByHash } from "../lib/counterparty";
import { API_TIMEOUT_MS, LOCK_TIMEOUT_SECONDS } from "../lib/constants";
import { batchExec } from "../lib/batch";
import { normalizeOrderMatch, normalizeOrder, normalizeDispenser, normalizeDispensePrice, buildOrderUpsertStmt, buildDispenserUpsertStmt } from "./normalize";
import { aggregateCandlesForPair, bucketTimestamp } from "./aggregate";
import { updatePairStats, updateOrderBookStats } from "./stats";
import { updateDispenserStats } from "./dispenser-stats";
import { scoreNewOrders, scoreNewDispensers, pruneClosedDeals } from "./deal-scores";
import { getMode } from "./state";

// Event types we care about for DEX indexing
const DEX_EVENTS = [
  "ORDER_MATCH",
  "OPEN_ORDER",
  "ORDER_UPDATE",
  "CANCEL_ORDER",
  "ORDER_EXPIRATION",
  "OPEN_DISPENSER",
  "DISPENSER_UPDATE",
  "DISPENSE",
].join(",");

interface BlockEvent {
  event_index: number;
  event: string;
  params: Record<string, unknown>;
  tx_hash: string;
  block_index?: number;  // Present in /v2/events, absent in /blocks/{N}/events
  block_time?: number;   // Present in some event types (ORDER_MATCH, OPEN_ORDER) but not others
}

interface SyncResult {
  blocks_processed: number;
  last_block: number;
  current_block: number;
  trades_inserted: number;
  orders_upserted: number;
  orders_closed: number;
  dispensers_upserted: number;
  dispensers_updated: number;
  dispenses_inserted: number;
  sends_inserted: number;
}

async function fetchCurrentBlock(
  apiBase: string
): Promise<{ block_index: number; block_time: number; block_hash: string }> {
  const res = await fetch(`${apiBase}/blocks/last`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to fetch last block: ${res.status}`);
  const data: { result: { block_index: number; block_time: number; block_hash: string } } =
    await res.json();
  return data.result;
}

async function fetchBlockHash(
  apiBase: string,
  blockIndex: number
): Promise<string> {
  const res = await fetch(`${apiBase}/blocks/${blockIndex}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to fetch block ${blockIndex}: ${res.status}`);
  const data: { result: { block_hash: string } } = await res.json();
  return data.result.block_hash;
}

async function fetchBlockEvents(
  apiBase: string,
  blockIndex: number
): Promise<BlockEvent[]> {
  const events: BlockEvent[] = [];
  let cursor: string | null = null;

  // Paginate through all events in the block
  while (true) {
    const url = new URL(
      `${apiBase}/blocks/${blockIndex}/events`
    );
    url.searchParams.set("event_name", DEX_EVENTS);
    url.searchParams.set("verbose", "true");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Failed to fetch events for block ${blockIndex}: ${res.status}`);

    const data: {
      result: BlockEvent[];
      next_cursor: number | null;
    } = await res.json();

    events.push(...data.result);

    if (!data.next_cursor || data.result.length === 0) break;
    cursor = String(data.next_cursor);
  }

  return events;
}

function extractAssetLongname(info: unknown): string | null {
  if (info && typeof info === "object" && "asset_longname" in (info as Record<string, unknown>)) {
    const ln = (info as Record<string, unknown>).asset_longname;
    return typeof ln === "string" && ln.length > 0 ? ln : null;
  }
  return null;
}

function processOrderMatch(
  params: Record<string, unknown>,
  blockIndex: number,
  blockTime: number
): {
  stmt: (db: D1Database) => D1PreparedStatement;
  pair: string;
  base: string;
  quote: string;
  baseLongname: string | null;
  quoteLongname: string | null;
  earliestTime: number;
} {
  const match: OrderMatch = {
    id: params.id as string,
    tx0_hash: params.tx0_hash as string,
    tx1_hash: params.tx1_hash as string,
    tx0_address: params.tx0_address as string,
    tx1_address: params.tx1_address as string,
    forward_asset: params.forward_asset as string,
    backward_asset: params.backward_asset as string,
    forward_quantity: 0,
    backward_quantity: 0,
    forward_quantity_normalized: params.forward_quantity_normalized as string,
    backward_quantity_normalized: params.backward_quantity_normalized as string,
    block_index: blockIndex,
    block_time: blockTime,
    status: "completed",
  };

  const t = normalizeOrderMatch(match);

  // Extract longnames from verbose asset info
  const fwdLongname = extractAssetLongname(params.forward_asset_info);
  const bwdLongname = extractAssetLongname(params.backward_asset_info);
  const baseLongname = t.base_asset === match.forward_asset ? fwdLongname : bwdLongname;
  const quoteLongname = t.quote_asset === match.forward_asset ? fwdLongname : bwdLongname;

  return {
    pair: t.pair,
    base: t.base_asset,
    quote: t.quote_asset,
    baseLongname,
    quoteLongname,
    earliestTime: blockTime,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO trades
           (match_id, pair, base_asset, quote_asset, block_index, block_time,
            price, amount, volume, side, maker, taker, tx0_hash, tx1_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          t.match_id, t.pair, t.base_asset, t.quote_asset,
          t.block_index, t.block_time, t.price, t.amount, t.volume,
          t.side, t.maker, t.taker, t.tx0_hash, t.tx1_hash
        ),
  };
}

function processOpenOrder(
  params: Record<string, unknown>,
  blockIndex: number,
  blockTime: number,
  now: number
): (db: D1Database) => D1PreparedStatement {
  const order: Order = {
    tx_hash: params.tx_hash as string,
    tx_index: params.tx_index as number,
    source: params.source as string,
    give_asset: params.give_asset as string,
    get_asset: params.get_asset as string,
    give_quantity: 0,
    give_remaining: 0,
    get_quantity: 0,
    get_remaining: 0,
    expiration: params.expiration as number,
    expire_index: params.expire_index as number,
    block_index: blockIndex,
    block_time: blockTime,
    status: "open",
    give_quantity_normalized: (params.give_quantity_normalized as string) ?? "",
    get_quantity_normalized: (params.get_quantity_normalized as string) ?? "",
    give_remaining_normalized: params.give_remaining_normalized as string,
    get_remaining_normalized: params.get_remaining_normalized as string,
  };

  const o = normalizeOrder(order);

  return (db) => buildOrderUpsertStmt(db, o, now);
}

function processOrderPartialFill(
  txHash: string,
  giveRemaining: number,
  getRemaining: number
): (db: D1Database) => D1PreparedStatement {
  return (db) =>
    db
      .prepare(
        `UPDATE orders SET give_remaining = ?, get_remaining = ?,
           remaining = MAX(0, CASE WHEN side = 'bid' THEN ? ELSE ? END)
         WHERE tx_hash = ? AND status = 'open'`
      )
      .bind(giveRemaining, getRemaining, getRemaining, giveRemaining, txHash);
}

function processOrderClose(
  params: Record<string, unknown>,
  now: number,
  closedStatus: string = 'closed'
): (db: D1Database) => D1PreparedStatement {
  // ORDER_UPDATE uses tx_hash, CANCEL_ORDER uses offer_hash, ORDER_EXPIRATION uses order_hash
  const txHash = (params.tx_hash ?? params.offer_hash ?? params.order_hash) as string;

  // When filled, zero out remaining — the order is fully consumed
  if (closedStatus === "filled") {
    return (db) =>
      db
        .prepare(
          `UPDATE orders SET status = ?, closed_at = ?,
             give_remaining = 0, get_remaining = 0, remaining = 0
           WHERE tx_hash = ? AND status = 'open'`
        )
        .bind(closedStatus, now, txHash);
  }

  return (db) =>
    db
      .prepare(
        `UPDATE orders SET status = ?, closed_at = ?
         WHERE tx_hash = ? AND status = 'open'`
      )
      .bind(closedStatus, now, txHash);
}

function processOpenDispenser(
  params: Record<string, unknown>,
  blockIndex: number,
  blockTime: number,
  now: number
): ((db: D1Database) => D1PreparedStatement) | null {
  const raw: CounterpartyDispenser = {
    tx_hash: params.tx_hash as string,
    tx_index: params.tx_index as number,
    source: params.source as string,
    asset: params.asset as string,
    give_quantity: 0,
    give_quantity_normalized: params.give_quantity_normalized as string,
    escrow_quantity: 0,
    escrow_quantity_normalized: params.escrow_quantity_normalized as string,
    give_remaining: 0,
    give_remaining_normalized: params.give_remaining_normalized as string,
    satoshirate: params.satoshirate as number,
    satoshirate_normalized: params.satoshirate_normalized as string,
    satoshi_price: params.satoshirate as number,
    price: 0,
    price_normalized: (params.price_normalized as string) ?? "0",
    status: params.status as number,
    dispense_count: (params.dispense_count as number) ?? 0,
    block_index: blockIndex,
    block_time: blockTime,
    oracle_address: (params.oracle_address as string | null) ?? null,
  };

  const d = normalizeDispenser(raw);
  if (!d) return null;

  return (db) => buildDispenserUpsertStmt(db, d, now);
}

function normalizeRawQuantity(
  raw: number,
  assetInfo: Record<string, unknown> | undefined
): number {
  const divisible = assetInfo?.divisible === true;
  return divisible ? raw / 1e8 : raw;
}

function processDispenserUpdate(
  params: Record<string, unknown>,
  now: number
): (db: D1Database) => D1PreparedStatement {
  const txHash = params.tx_hash as string;
  const status = params.status as number;

  // Normalize give_remaining: prefer _normalized, fall back to raw + asset_info.divisible
  let giveRemaining: number | null = null;
  if (params.give_remaining_normalized != null) {
    giveRemaining = parseFloat(params.give_remaining_normalized as string);
  } else if (params.give_remaining != null) {
    giveRemaining = normalizeRawQuantity(
      params.give_remaining as number,
      params.asset_info as Record<string, unknown> | undefined
    );
  }
  if (giveRemaining != null && !isFinite(giveRemaining)) giveRemaining = null;

  const dispenseCount = params.dispense_count as number | undefined;

  if (status >= 10) {
    // Dispenser closed (10=STATUS_CLOSED) or closing (11=STATUS_CLOSING)
    if (giveRemaining != null && dispenseCount != null) {
      return (db) =>
        db
          .prepare(
            `UPDATE dispensers SET status = ?, give_remaining = ?,
             dispense_count = ?, closed_at = ? WHERE tx_hash = ?`
          )
          .bind(status, giveRemaining, dispenseCount, now, txHash);
    }
    // Some close events (status=11) omit remaining/count — just update status
    return (db) =>
      db
        .prepare(`UPDATE dispensers SET status = ?, closed_at = ? WHERE tx_hash = ?`)
        .bind(status, now, txHash);
  }

  // status 0 (STATUS_OPEN) or 1 (STATUS_OPEN_EMPTY_ADDRESS) — still open
  if (giveRemaining != null && dispenseCount != null) {
    return (db) =>
      db
        .prepare(
          `UPDATE dispensers SET status = ?, give_remaining = ?, dispense_count = ?
           WHERE tx_hash = ?`
        )
        .bind(status, giveRemaining, dispenseCount, txHash);
  }
  // Fallback: just update status
  return (db) =>
    db
      .prepare(`UPDATE dispensers SET status = ? WHERE tx_hash = ?`)
      .bind(status, txHash);
}

function processDispense(
  params: Record<string, unknown>,
  blockIndex: number,
  blockTime: number
): { stmt: (db: D1Database) => D1PreparedStatement; asset: string } {
  const dispenseQty = parseFloat(
    params.dispense_quantity_normalized as string
  );
  const btcAmount = parseFloat(params.btc_amount_normalized as string);
  const price = normalizeDispensePrice(dispenseQty, btcAmount);

  return {
    asset: params.asset as string,
    stmt: (db) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO dispenses
           (tx_hash, dispense_index, dispenser_tx_hash, source, destination,
            asset, dispense_quantity, btc_amount, price,
            block_index, block_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          params.tx_hash as string,
          params.dispense_index as number,
          params.dispenser_tx_hash as string,
          params.source as string,
          params.destination as string,
          params.asset as string,
          dispenseQty,
          btcAmount,
          price,
          blockIndex,
          blockTime
        ),
  };
}

/**
 * Process all DEX events from new blocks since our last checkpoint.
 * This replaces the full-snapshot approach with incremental block-following.
 */
export async function syncBlocks(
  db: D1Database,
  apiBase: string,
  maxBlocks: number = 10
): Promise<SyncResult> {
  const noopResult: SyncResult = {
    blocks_processed: 0,
    last_block: 0,
    current_block: 0,
    trades_inserted: 0,
    orders_upserted: 0,
    orders_closed: 0,
    dispensers_upserted: 0,
    dispensers_updated: 0,
    dispenses_inserted: 0,
    sends_inserted: 0,
  };

  // Only run when in FOLLOWING mode
  const mode = await getMode(db);
  if (mode !== "FOLLOWING") return noopResult;

  const now = Math.floor(Date.now() / 1000);

  // Advisory lock: prevent concurrent syncBlocks (cron overlap or cron + manual)
  // Acquire lock only if no lock exists or the existing lock is stale (>120s)
  const lockResult = await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('sync_lock', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value
       WHERE CAST(value AS INTEGER) < ?`
    )
    .bind(String(now), now - LOCK_TIMEOUT_SECONDS)
    .run();
  if (lockResult.meta.changes === 0) return noopResult;

  try {
  // Get our last processed block + stored hash (for reorg detection)
  const [lastRow, lastHashRow] = await Promise.all([
    db.prepare(`SELECT value FROM indexer_state WHERE key = 'last_block_index'`).first<{ value: string }>(),
    db.prepare(`SELECT value FROM indexer_state WHERE key = 'last_block_hash'`).first<{ value: string }>(),
  ]);

  const currentBlock = await fetchCurrentBlock(apiBase);
  let lastBlock = lastRow ? parseInt(lastRow.value, 10) : currentBlock.block_index - 1;

  // Reorg detection
  let rollbackTo: number | null = null;

  if (currentBlock.block_index < lastBlock) {
    // Chain tip went backwards — obvious reorg
    console.log(`Reorg detected: chain tip ${currentBlock.block_index} < checkpoint ${lastBlock}`);
    rollbackTo = currentBlock.block_index;
  } else if (lastHashRow) {
    // Same-height reorg detection: verify our checkpoint block hash hasn't changed
    const checkpointHash = currentBlock.block_index === lastBlock
      ? currentBlock.block_hash
      : await fetchBlockHash(apiBase, lastBlock);
    if (checkpointHash !== lastHashRow.value) {
      console.log(
        `Reorg detected at block ${lastBlock}: hash mismatch ` +
        `(stored=${lastHashRow.value.slice(0, 16)}… actual=${checkpointHash.slice(0, 16)}…)`
      );
      rollbackTo = lastBlock - 1;
    }
  }

  if (rollbackTo !== null) {

    // Gather context BEFORE deleting any rows

    // Affected pairs/assets for stats recalculation
    const [affectedReorgPairs, affectedReorgAssets] = await Promise.all([
      db
        .prepare(
          `SELECT DISTINCT pair, base_asset, quote_asset FROM trades WHERE block_index > ?`
        )
        .bind(rollbackTo)
        .all<{ pair: string; base_asset: string; quote_asset: string }>(),
      db
        .prepare(`SELECT DISTINCT asset FROM dispenses WHERE block_index > ?`)
        .bind(rollbackTo)
        .all<{ asset: string }>(),
    ]);

    // Earliest block_time in invalidated blocks — used for candle cleanup
    const rollbackBlock = await db
      .prepare(`SELECT MIN(block_time) as t FROM trades WHERE block_index > ?`)
      .bind(rollbackTo)
      .first<{ t: number | null }>();

    // Candle deletes scoped to affected pairs, bucket-aligned to smallest interval
    const candleDeletes: D1PreparedStatement[] = [];
    if (rollbackBlock?.t) {
      const bucket = bucketTimestamp(rollbackBlock.t, "1h");
      for (const p of affectedReorgPairs.results) {
        candleDeletes.push(
          db.prepare(`DELETE FROM candles WHERE pair = ? AND timestamp >= ?`).bind(p.pair, bucket)
        );
      }
    }

    // Compute the wall-clock time threshold for identifying closures from this run.
    // syncBlocks is called by cron (every 10 min). Orders/dispensers closed with
    // closed_at >= this threshold were likely closed by events in the now-invalid blocks.
    // Use last_run_time as lower bound; any closure after that came from this or recent runs.
    const lastRunRow = await db
      .prepare(`SELECT value FROM indexer_state WHERE key = 'last_run_time'`)
      .first<{ value: string }>();
    const closureCutoff = lastRunRow ? parseInt(lastRunRow.value, 10) : now - 1200;

    // Core rollback: delete invalidated data + re-open recently closed orders/dispensers
    await db.batch([
      db.prepare(`DELETE FROM trades WHERE block_index > ?`).bind(rollbackTo),
      db.prepare(`DELETE FROM dispenses WHERE block_index > ?`).bind(rollbackTo),
      db.prepare(`DELETE FROM orders WHERE block_index > ?`).bind(rollbackTo),
      db.prepare(`DELETE FROM dispensers WHERE block_index > ?`).bind(rollbackTo),
      db.prepare(`DELETE FROM sends WHERE block_index > ?`).bind(rollbackTo),
      // Re-open orders/dispensers that pre-date the rollback but were closed recently
      // (i.e., closed by events in the now-invalidated blocks).
      // The next sync cycle re-processes replacement blocks and re-closes as needed.
      db.prepare(
        `UPDATE orders SET status = 'open', closed_at = NULL
         WHERE status != 'open' AND block_index <= ? AND closed_at >= ?`
      ).bind(rollbackTo, closureCutoff),
      db.prepare(
        `UPDATE dispensers SET status = 0, closed_at = NULL
         WHERE status != 0 AND block_index <= ? AND closed_at >= ?`
      ).bind(rollbackTo, closureCutoff),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('last_block_index', ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ).bind(String(rollbackTo)),
    ]);

    // Candle deletes in separate batches (one per pair, could exceed D1's 100-stmt limit)
    await batchExec(db, candleDeletes);

    // Recalculate stats for affected pairs and assets
    for (const p of affectedReorgPairs.results) {
      await aggregateCandlesForPair(db, p.pair, rollbackBlock?.t ?? 0);
      await updatePairStats(db, p.pair, p.base_asset, p.quote_asset);
    }
    for (const a of affectedReorgAssets.results) {
      await updateDispenserStats(db, a.asset);
    }
    // Recalculate order book stats after reorg
    await updateOrderBookStats(db, now);

    lastBlock = rollbackTo;
  }

  // Don't process more than maxBlocks at a time
  const targetBlock = Math.min(lastBlock + maxBlocks, currentBlock.block_index);

  const result: SyncResult = {
    blocks_processed: 0,
    last_block: lastBlock,
    current_block: currentBlock.block_index,
    trades_inserted: 0,
    orders_upserted: 0,
    orders_closed: 0,
    dispensers_upserted: 0,
    dispensers_updated: 0,
    dispenses_inserted: 0,
    sends_inserted: 0,
  };

  // Track affected pairs/assets for post-processing
  const affectedPairs = new Map<
    string,
    { base: string; quote: string; baseLongname: string | null; quoteLongname: string | null; earliestTime: number }
  >();
  const affectedDispenseAssets = new Map<string, string | null>();

  for (let blockIdx = lastBlock + 1; blockIdx <= targetBlock; blockIdx++) {
    const events = await fetchBlockEvents(apiBase, blockIdx);

    // Sort by event_index ASC — the Counterparty API returns DESC order,
    // but we need ASC so that OPEN_ORDER runs before ORDER_UPDATE (fill)
    // when an order is created and filled in the same block.
    events.sort((a, b) => a.event_index - b.event_index);

    // Derive block_time from any event that carries it (ORDER_MATCH, OPEN_ORDER,
    // OPEN_DISPENSER, DISPENSE all include block_time; ORDER_UPDATE and others don't).
    let blockTime: number | undefined;
    for (const ev of events) {
      blockTime = ev.block_time ?? (ev.params.block_time as number | undefined);
      if (blockTime) break;
    }

    const stmts: ((db: D1Database) => D1PreparedStatement)[] = [];

    for (const event of events) {
      try {
        const params = event.params;
        const blockIndex = event.block_index ?? (params.block_index as number | undefined) ?? blockIdx;
        // Per-event block_time if available, otherwise fall back to block-level.
        // Some events (ORDER_UPDATE, CANCEL_ORDER, ORDER_EXPIRATION, DISPENSER_UPDATE)
        // don't carry block_time — that's fine, they don't need it for their SQL ops.
        const eventBlockTime = event.block_time ?? (params.block_time as number | undefined) ?? blockTime;

        switch (event.event) {
          case "ORDER_MATCH": {
            if (!eventBlockTime) {
              console.error(`Block ${blockIdx}: skipping ORDER_MATCH — no block_time`);
              break;
            }
            // Only insert completed order matches — pending/expired matches
            // produce phantom trades with wrong prices (especially BTC pairs)
            const matchStatus = params.status as string | undefined;
            if (matchStatus && matchStatus !== "completed") {
              break;
            }
            const trade = processOrderMatch(params, blockIndex, eventBlockTime);
            stmts.push(trade.stmt);
            result.trades_inserted++;

            const existing = affectedPairs.get(trade.pair);
            if (!existing || eventBlockTime < existing.earliestTime) {
              affectedPairs.set(trade.pair, {
                base: trade.base,
                quote: trade.quote,
                baseLongname: trade.baseLongname ?? existing?.baseLongname ?? null,
                quoteLongname: trade.quoteLongname ?? existing?.quoteLongname ?? null,
                earliestTime: eventBlockTime,
              });
            } else {
              if (trade.baseLongname && !existing.baseLongname) {
                existing.baseLongname = trade.baseLongname;
              }
              if (trade.quoteLongname && !existing.quoteLongname) {
                existing.quoteLongname = trade.quoteLongname;
              }
            }
            break;
          }

          case "OPEN_ORDER": {
            if (!eventBlockTime) {
              console.error(`Block ${blockIdx}: skipping OPEN_ORDER — no block_time`);
              break;
            }
            stmts.push(processOpenOrder(params, blockIndex, eventBlockTime, now));
            result.orders_upserted++;
            break;
          }

          case "ORDER_UPDATE": {
            const orderStatus = params.status as string;
            if (orderStatus === "open") {
              // Partial fill — ORDER_UPDATE events don't include _normalized remaining
              // fields, so fetch the full order from the Counterparty API with verbose=true.
              const txHash = params.tx_hash as string;
              const cpOrder = await fetchOrderByHash(apiBase, txHash);
              if (cpOrder) {
                const giveRemaining = parseFloat(cpOrder.give_remaining_normalized);
                const getRemaining = parseFloat(cpOrder.get_remaining_normalized);
                if (isFinite(giveRemaining) && isFinite(getRemaining)) {
                  stmts.push(processOrderPartialFill(txHash, giveRemaining, getRemaining));
                  result.orders_upserted++;
                }
              }
            } else if (
              orderStatus === "expired" ||
              orderStatus === "filled" ||
              orderStatus === "cancelled"
            ) {
              stmts.push(processOrderClose(params, now, orderStatus));
              result.orders_closed++;
            } else if (orderStatus.toLowerCase().startsWith("invalid")) {
              stmts.push(processOrderClose(params, now, "invalid"));
              result.orders_closed++;
            }
            break;
          }

          case "CANCEL_ORDER": {
            const cancelStatus = params.status as string;
            if (cancelStatus === "valid") {
              stmts.push(processOrderClose(params, now, "cancelled"));
              result.orders_closed++;
            }
            break;
          }

          case "ORDER_EXPIRATION": {
            stmts.push(processOrderClose(params, now, "expired"));
            result.orders_closed++;
            break;
          }

          case "OPEN_DISPENSER": {
            if (!eventBlockTime) {
              console.error(`Block ${blockIdx}: skipping OPEN_DISPENSER — no block_time`);
              break;
            }
            const dispenserStmt = processOpenDispenser(params, blockIndex, eventBlockTime, now);
            if (dispenserStmt) {
              stmts.push(dispenserStmt);
              result.dispensers_upserted++;
              const asset = params.asset as string;
              const longname = extractAssetLongname(params.asset_info);
              if (!affectedDispenseAssets.has(asset) || longname) {
                affectedDispenseAssets.set(asset, longname ?? affectedDispenseAssets.get(asset) ?? null);
              }
            }
            break;
          }

          case "DISPENSER_UPDATE": {
            stmts.push(processDispenserUpdate(params, now));
            result.dispensers_updated++;
            const asset = params.asset as string;
            const longname = extractAssetLongname(params.asset_info);
            if (!affectedDispenseAssets.has(asset) || longname) {
              affectedDispenseAssets.set(asset, longname ?? affectedDispenseAssets.get(asset) ?? null);
            }
            break;
          }

          case "DISPENSE": {
            if (!eventBlockTime) {
              console.error(`Block ${blockIdx}: skipping DISPENSE — no block_time`);
              break;
            }
            const dispense = processDispense(params, blockIndex, eventBlockTime);
            stmts.push(dispense.stmt);
            const longname = extractAssetLongname(params.asset_info);
            if (!affectedDispenseAssets.has(dispense.asset) || longname) {
              affectedDispenseAssets.set(dispense.asset, longname ?? affectedDispenseAssets.get(dispense.asset) ?? null);
            }
            result.dispenses_inserted++;
            break;
          }

          case "SEND":
          case "ENHANCED_SEND":
          case "MPMA_SEND": {
            if (!eventBlockTime) break;
            const sendStatus = params.status as string;
            if (sendStatus !== "valid") break;
            const sendAsset = params.asset as string;
            const sendSource = params.source as string;
            const sendDest = params.destination as string;
            const sendQty = params.quantity as number;
            const sendTxHash = params.tx_hash as string;
            if (sendAsset && sendSource && sendDest && sendTxHash) {
              stmts.push((db: D1Database) =>
                db.prepare(
                  `INSERT OR IGNORE INTO sends (tx_hash, asset, source, destination, quantity, block_index, block_time) VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(sendTxHash, sendAsset, sendSource, sendDest, sendQty ?? 0, blockIndex, eventBlockTime)
              );
              result.sends_inserted++;
            }
            break;
          }
        }
      } catch (e) {
        console.error(
          `Block ${blockIdx}: failed to process ${event.event} (event_index=${event.event_index}):`, e
        );
        // Skip this event, continue processing the rest of the block
      }
    }

    // Execute all statements for this block in batches
    if (stmts.length > 0) {
      try {
        await batchExec(db, stmts.map((fn) => fn(db)));
      } catch (e) {
        console.error(`Block ${blockIdx} batch error:`, e);
        console.error(`Events in block: ${events.map((ev) => ev.event).join(",")}`);
        throw e;
      }
    }

    // Update checkpoint after each block
    await db
      .prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('last_block_index', ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      )
      .bind(String(blockIdx))
      .run();

    lastBlock = blockIdx;
    result.blocks_processed++;
  }

  // Post-processing: aggregate candles + update stats for affected pairs
  for (const [pair, info] of affectedPairs) {
    await aggregateCandlesForPair(db, pair, info.earliestTime);
    await updatePairStats(db, pair, info.base, info.quote, info.baseLongname, info.quoteLongname);
  }

  // Post-processing: update dispenser stats for affected assets
  for (const [asset, longname] of affectedDispenseAssets) {
    await updateDispenserStats(db, asset, longname);
  }

  // Update order book stats for pairs with changed orders
  if (result.orders_upserted > 0 || result.orders_closed > 0) {
    await updateOrderBookStats(db, now);
  }

  // Incremental deal scoring for affected orders/dispensers
  if (affectedPairs.size > 0 || affectedDispenseAssets.size > 0) {
    try {
      const orderPairs = [...affectedPairs.keys()];
      const dispAssets = [...affectedDispenseAssets.keys()];
      const [orderDeals, dispDeals] = await Promise.all([
        orderPairs.length > 0 ? scoreNewOrders(db, orderPairs) : 0,
        dispAssets.length > 0 ? scoreNewDispensers(db, dispAssets) : 0,
      ]);
      // Prune closed listings
      if (result.orders_closed > 0 || result.dispensers_updated > 0) {
        await pruneClosedDeals(db);
      }
      if (orderDeals > 0 || dispDeals > 0) {
        console.log(`[deal-scores] Scored ${orderDeals} orders + ${dispDeals} dispensers`);
      }
    } catch (e) {
      console.error("[deal-scores] Incremental scoring failed:", e);
    }
  }

  // Save run time
  await db.prepare(
    `INSERT INTO indexer_state (key, value) VALUES ('last_run_time', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).bind(String(now)).run();

  // Store block hash for same-height reorg detection on next run
  if (result.blocks_processed > 0) {
    const lastProcessedHash = lastBlock === currentBlock.block_index
      ? currentBlock.block_hash
      : await fetchBlockHash(apiBase, lastBlock);
    await db.prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('last_block_hash', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    ).bind(lastProcessedHash).run();
  }

  result.last_block = lastBlock;
  return result;

  } finally {
    // Always release advisory lock, even on error
    await db.prepare(`DELETE FROM indexer_state WHERE key = 'sync_lock'`).run();
  }
}
