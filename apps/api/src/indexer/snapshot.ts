import { fetchOrders, fetchOrderByHash, fetchDispensers } from "../lib/counterparty";
import { API_TIMEOUT_MS, MAX_PAGINATION_PAGES } from "../lib/constants";
import { batchExec } from "../lib/batch";
import { normalizeOrder, NormalizedOrder, normalizeDispenser, NormalizedDispenser, buildOrderUpsertStmt, buildDispenserUpsertStmt } from "./normalize";
import { updateOrderBookStats } from "./stats";
import { upsertDispenserAggregates } from "./dispenser-stats";
import { setState, deleteState } from "./state";

export async function syncOrders(
  db: D1Database,
  apiBase: string
): Promise<{ synced: number; closed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch ALL open orders from CP API
  const allOrders: NormalizedOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGINATION_PAGES) {
    const { orders, nextCursor } = await fetchOrders(apiBase, "open", cursor);
    if (orders.length === 0) break;

    for (const order of orders) {
      try {
        allOrders.push(normalizeOrder(order));
      } catch (e) {
        console.error(`Failed to normalize order ${order.tx_hash}:`, e);
      }
    }

    cursor = nextCursor;
    pages++;
    if (!nextCursor) break;
  }

  // Upsert all open orders
  const upsertStmts = allOrders.map((o) => buildOrderUpsertStmt(db, o, now));
  await batchExec(db, upsertStmts);

  // Close orders that were open in our DB but not in the fresh set
  const openHashes = new Set(allOrders.map((o) => o.tx_hash));
  const dbOpen = await db
    .prepare(`SELECT tx_hash, expire_index FROM orders WHERE status = 'open'`)
    .all<{ tx_hash: string; expire_index: number }>();

  const lastBlockRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'last_block_index'`)
    .first<{ value: string }>();
  const lastBlock = lastBlockRow ? parseInt(lastBlockRow.value, 10) : 0;

  const toClose = dbOpen.results.filter((r) => !openHashes.has(r.tx_hash));
  const closeStmts: D1PreparedStatement[] = [];

  for (const r of toClose) {
    let realStatus: string;
    if (r.expire_index <= lastBlock) {
      realStatus = "expired";
    } else {
      // Look up the real status from the Counterparty API
      const cpOrder = await fetchOrderByHash(apiBase, r.tx_hash);
      realStatus = cpOrder?.status ?? "filled";
    }
    closeStmts.push(
      db
        .prepare(`UPDATE orders SET status = ?, closed_at = ? WHERE tx_hash = ?`)
        .bind(realStatus, now, r.tx_hash)
    );
  }
  await batchExec(db, closeStmts);

  // Update pair_stats with order book metrics
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
          console.error(`Failed to normalize dispenser ${d.tx_hash}:`, e);
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
    const res = await fetch(`${apiBase}/blocks/last`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Failed to fetch last block: ${res.status}`);
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
          console.error(`Failed to normalize dispenser ${d.tx_hash}:`, e);
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
  console.error(`Unknown snapshot phase "${phase}", resetting to "orders"`);
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
      console.error(`Failed to normalize order ${order.tx_hash}:`, e);
    }
  }

  await batchExec(db, stmts);

  return {
    inserted: stmts.length,
    nextCursor,
    status: statusToFetch,
  };
}
