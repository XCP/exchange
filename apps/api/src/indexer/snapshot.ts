import { freshCounterpartyUrl } from "../lib/fresh-read";
import { fetchOrders, fetchOrderByHash, fetchDispensers } from "../lib/counterparty";
import { API_TIMEOUT_MS, MAX_PAGINATION_PAGES } from "../lib/constants";
import { batchExec } from "../lib/batch";
import { normalizeOrder, NormalizedOrder, normalizeDispenser, NormalizedDispenser, buildOrderUpsertStmt, buildDispenserUpsertStmt } from "./normalize";
import { updateOrderBookStats } from "./stats";
import { upsertDispenserAggregates } from "./dispenser-stats";
import { setState, deleteState } from "./state";
import { discard } from "../lib/net";
import { logError } from "../lib/log";

interface OrderSnapshotAnchor {
  block_index: number;
  block_hash: string;
  ledger_hash: string;
  messages_hash: string;
}

async function orderSnapshotAnchor(apiBase: string): Promise<OrderSnapshotAnchor> {
  const response = await fetch(freshCounterpartyUrl(`${apiBase}/blocks/last`), {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) {
    await discard(response);
    throw new Error(`Order snapshot anchor failed: ${response.status}`);
  }
  const { result } = await response.json<{ result: OrderSnapshotAnchor }>();
  if (!Number.isSafeInteger(result?.block_index) || !result.block_hash ||
      !result.ledger_hash || !result.messages_hash) {
    throw new Error("Incomplete order snapshot anchor");
  }
  return result;
}

export async function syncOrders(
  db: D1Database,
  apiBase: string
): Promise<{ synced: number; closed: number }> {
  const now = Math.floor(Date.now() / 1000);
  const anchor = await orderSnapshotAnchor(apiBase);
  const allOrders: NormalizedOrder[] = [];
  const openHashes = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let complete = false;

  // Do not infer absence from a truncated feed or a row we failed to normalize.
  for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
    const { orders, nextCursor } = await fetchOrders(apiBase, "open", cursor);
    if (!Array.isArray(orders) || (orders.length === 0 && nextCursor !== null)) {
      throw new Error("Incomplete open-order page");
    }
    for (const order of orders) {
      if (order.status !== "open" || openHashes.has(order.tx_hash)) {
        throw new Error("Inconsistent open-order snapshot");
      }
      allOrders.push(normalizeOrder(order));
      openHashes.add(order.tx_hash);
    }
    if (nextCursor === null) { complete = true; break; }
    if (cursors.has(nextCursor)) throw new Error("Repeated open-order cursor");
    cursors.add(nextCursor);
    cursor = nextCursor;
  }
  if (!complete) throw new Error("Open-order pagination limit reached");

  const dbOpen = await db.prepare(`SELECT tx_hash FROM orders WHERE status = 'open'`)
    .all<{ tx_hash: string }>();
  const toClose = dbOpen.results.filter(row => !openHashes.has(row.tx_hash));
  const closeStmts: D1PreparedStatement[] = [];
  for (const row of toClose) {
    const order = await fetchOrderByHash(apiBase, row.tx_hash);
    if (!order || order.tx_hash !== row.tx_hash) {
      throw new Error(`Cannot verify missing order ${row.tx_hash}`);
    }
    if (!["filled", "expired", "cancelled"].includes(order.status) &&
        !order.status.startsWith("invalid")) {
      throw new Error(`Unresolved order status for ${row.tx_hash}: ${order.status}`);
    }
    const normalized = normalizeOrder(order);
    // A filled BTC order can retain one satoshi. Preserve the canonical values.
    closeStmts.push(db.prepare(
      `UPDATE orders SET status = ?, closed_at = ?, give_remaining = ?,
         get_remaining = ?, remaining = ? WHERE tx_hash = ? AND status = 'open'`
    ).bind(order.status, now, normalized.give_remaining, normalized.get_remaining,
      normalized.remaining, row.tx_hash));
  }

  const end = await orderSnapshotAnchor(apiBase);
  if (["block_index", "block_hash", "ledger_hash", "messages_hash"].some(
    key => anchor[key as keyof OrderSnapshotAnchor] !== end[key as keyof OrderSnapshotAnchor]
  )) throw new Error("Order snapshot chain changed; retry before writing");

  // All canonical reads and validations finish before the first order mutation.
  // Writers must be coordinated by the caller; batches remain retryable.
  await batchExec(db, allOrders.map(order => buildOrderUpsertStmt(db, order, now)));
  await batchExec(db, closeStmts);
  await updateOrderBookStats(db, now);
  return { synced: allOrders.length, closed: toClose.length };
}

export async function syncDispensers(
  db: D1Database,
  apiBase: string
): Promise<{ synced: number; closed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch ALL open dispensers from CP API (status 0 = open, 1 = open on empty address)
  const allDispensers: NormalizedDispenser[] = [];

  for (const openStatus of [0, 1]) {
    let cursor: string | null = null;
    let pages = 0;

    while (pages < MAX_PAGINATION_PAGES) {
      const { dispensers, nextCursor } = await fetchDispensers(apiBase, openStatus, cursor);
      if (dispensers.length === 0) break;

      for (const d of dispensers) {
        try {
          const norm = normalizeDispenser(d);
          if (norm) allDispensers.push(norm);
        } catch (e) {
          logError("DISPENSER_NORMALIZATION_FAILED", { tx_hash: d.tx_hash, error: e });
        }
      }

      cursor = nextCursor;
      pages++;
      if (!nextCursor) break;
    }
  }

  // Upsert all open dispensers
  const upsertStmts = allDispensers.map((d) => buildDispenserUpsertStmt(db, d, now));
  await batchExec(db, upsertStmts);

  // Close dispensers that were open in our DB but not in the fresh set
  const openHashes = new Set(allDispensers.map((d) => d.tx_hash));
  const dbOpen = await db
    .prepare(`SELECT tx_hash FROM dispensers WHERE status < 10`)
    .all<{ tx_hash: string }>();

  const toClose = dbOpen.results.filter((r) => !openHashes.has(r.tx_hash));
  const closeStmts = toClose.map((r) =>
    db
      .prepare(`UPDATE dispensers SET status = 10, closed_at = ? WHERE tx_hash = ?`)
      .bind(now, r.tx_hash)
  );
  await batchExec(db, closeStmts);

  // Aggregate per-asset counts into dispenser_stats
  await upsertDispenserAggregates(db, now);

  return { synced: allDispensers.length, closed: toClose.length };
}

/**
 * Run one sub-step of the snapshot sync.
 * Phase: orders -> dispensers_0 -> dispensers_1 -> finalize -> BUILD_AGGREGATES
 * Each call fits within Worker time limits.
 */
export async function runSnapshotStep(
  db: D1Database,
  apiBase: string,
  maxPages: number = 20
): Promise<{ step: string; [key: string]: unknown }> {
  const phase = (await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'snapshot_phase'`)
    .first<{ value: string }>())?.value ?? "orders";

  if (phase === "orders") {
    // Fetch chain tip first, but only persist AFTER syncOrders succeeds
    const res = await fetch(freshCounterpartyUrl(`${apiBase}/blocks/last`), { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!res.ok) {
      await discard(res);
      throw new Error(`Failed to fetch last block: ${res.status}`);
    }
    const data: { result: { block_index: number } } = await res.json();

    const result = await syncOrders(db, apiBase);

    // Atomic: persist block index + phase transition together
    await db.batch([
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('last_block_index', ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ).bind(String(data.result.block_index)),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('snapshot_phase', 'dispensers_0')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
    return { step: "orders", ...result };
  }

  // Paginated dispenser sync: dispensers_0 (status=0) then dispensers_1 (status=1)
  if (phase === "dispensers_0" || phase === "dispensers_1") {
    const openStatus = phase === "dispensers_0" ? 0 : 1;
    const cursorKey = `snapshot_dispenser_cursor_${openStatus}`;
    const cursor = (await db
      .prepare(`SELECT value FROM indexer_state WHERE key = ?`)
      .bind(cursorKey)
      .first<{ value: string }>())?.value ?? null;

    const now = Math.floor(Date.now() / 1000);
    let synced = 0;
    let currentCursor = cursor;
    let pages = 0;

    while (pages < maxPages) {
      const { dispensers, nextCursor } = await fetchDispensers(apiBase, openStatus, currentCursor);
      if (dispensers.length === 0) break;

      const chunk: NormalizedDispenser[] = [];
      for (const d of dispensers) {
        try {
          const norm = normalizeDispenser(d);
          if (norm) chunk.push(norm);
        } catch (e) {
          logError("DISPENSER_NORMALIZATION_FAILED", { tx_hash: d.tx_hash, error: e });
        }
      }

      if (chunk.length > 0) {
        const stmts = chunk.map((d) => buildDispenserUpsertStmt(db, d, now));
        await batchExec(db, stmts);
        synced += chunk.length;
      }

      currentCursor = nextCursor;
      pages++;
      if (!nextCursor) { currentCursor = null; break; }
    }

    if (currentCursor) {
      // More pages to fetch
      await setState(db, cursorKey, currentCursor);
      return { step: phase, synced, done: false, pages };
    }

    // Done with this status — clean up cursor and advance
    await deleteState(db, cursorKey);
    if (phase === "dispensers_0") {
      await setState(db, "snapshot_phase", "dispensers_1");
      return { step: "dispensers_0", synced, done: true, pages };
    }

    // Done with both statuses — run closure detection + stats
    await setState(db, "snapshot_phase", "finalize");
    return { step: "dispensers_1", synced, done: true, pages };
  }

  if (phase === "finalize") {
    const now = Math.floor(Date.now() / 1000);

    // Aggregate per-asset counts into dispenser_stats
    await upsertDispenserAggregates(db, now);

    // Seed pair_stats for ALL traded pairs
    await db
      .prepare(
        `INSERT OR IGNORE INTO pair_stats (pair, base_asset, quote_asset)
         SELECT DISTINCT pair, base_asset, quote_asset FROM trades`
      )
      .run();

    // Atomic: clean up phase + set mode + seed aggregation cursor
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'snapshot_phase'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'BUILD_AGGREGATES')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('aggregation_cursor', '')
         ON CONFLICT (key) DO NOTHING`
      ),
    ]);

    const dispenserCount = await db
      .prepare(`SELECT COUNT(*) as cnt FROM dispensers WHERE status < 10`)
      .first<{ cnt: number }>();

    return { step: "finalize", dispensers: dispenserCount?.cnt ?? 0, mode: "BUILD_AGGREGATES" };
  }

  // Unknown phase — reset to start rather than looping forever
  logError("UNKNOWN_SNAPSHOT_PHASE", { phase, reset_to: "orders" });
  await setState(db, "snapshot_phase", "orders");
  return { step: "reset", previousPhase: phase };
}

/**
 * Re-index all orders from CP API with real statuses.
 * Fetches open, filled, expired, cancelled orders and replaces the orders table.
 * Designed to be called in batches via cursor — one status at a time.
 */
export async function reindexOrders(
  db: D1Database,
  apiBase: string,
  statusToFetch: string,
  cursorParam: string | null,
  batchSize: number = 200
): Promise<{ inserted: number; nextCursor: string | null; status: string }> {
  const now = Math.floor(Date.now() / 1000);

  const { orders, nextCursor } = await fetchOrders(apiBase, statusToFetch, cursorParam, batchSize);

  const stmts: D1PreparedStatement[] = [];
  for (const order of orders) {
    try {
      // Skip invalid orders with zero quantities (CP API sometimes returns these as "open")
      const rawGive = parseFloat(order.give_quantity_normalized ?? order.give_remaining_normalized ?? "0");
      if (rawGive <= 0 && order.status === "open") continue;

      const o = normalizeOrder(order);
      const cpStatus = order.status === "open" ? "open"
        : order.status === "expired" ? "expired"
        : order.status === "cancelled" ? "cancelled"
        : order.status === "filled" ? "filled"
        : order.status.toLowerCase().startsWith("invalid") ? "invalid"
        : order.status;
      stmts.push(
        db.prepare(
          `INSERT INTO orders
           (tx_hash, tx_index, pair, base_asset, quote_asset, source, side,
            price, amount, give_quantity, get_quantity, give_remaining, get_remaining, remaining,
            expiration, expire_index, block_index, block_time,
            status, first_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tx_hash) DO UPDATE SET
             status = excluded.status,
             price = excluded.price,
             amount = excluded.amount,
             give_quantity = excluded.give_quantity,
             get_quantity = excluded.get_quantity,
             give_remaining = excluded.give_remaining,
             get_remaining = excluded.get_remaining,
             remaining = excluded.remaining`
        ).bind(
          o.tx_hash, o.tx_index, o.pair, o.base_asset, o.quote_asset,
          o.source, o.side, o.price, o.amount, o.give_quantity, o.get_quantity,
          o.give_remaining, o.get_remaining, o.remaining,
          o.expiration, o.expire_index,
          o.block_index, o.block_time, cpStatus, now
        )
      );
    } catch (e) {
      logError("ORDER_NORMALIZATION_FAILED", { tx_hash: order.tx_hash, error: e });
    }
  }

  await batchExec(db, stmts);

  return {
    inserted: stmts.length,
    nextCursor,
    status: statusToFetch,
  };
}
