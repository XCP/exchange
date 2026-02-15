import { fetchOrders, fetchDispensers } from "../lib/counterparty";
import { normalizeOrder, NormalizedOrder, normalizeDispenser, NormalizedDispenser } from "./normalize";
import { setState, setMode, deleteState } from "./state";

export async function syncOrders(
  db: D1Database,
  apiBase: string
): Promise<{ synced: number; closed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch ALL open orders from CP API
  const allOrders: NormalizedOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 500) {
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
  for (let i = 0; i < allOrders.length; i += 50) {
    const batch = allOrders.slice(i, i + 50);
    const stmts = batch.map((o) =>
      db
        .prepare(
          `INSERT INTO orders
           (tx_hash, tx_index, pair, base_asset, quote_asset, source, side,
            price, amount, give_remaining, get_remaining,
            expiration, expire_index, block_index, block_time,
            status, first_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
           ON CONFLICT (tx_hash) DO UPDATE SET
             amount = excluded.amount,
             give_remaining = excluded.give_remaining,
             get_remaining = excluded.get_remaining,
             status = 'open',
             closed_at = NULL`
        )
        .bind(
          o.tx_hash, o.tx_index, o.pair, o.base_asset, o.quote_asset,
          o.source, o.side, o.price, o.amount, o.give_remaining,
          o.get_remaining, o.expiration, o.expire_index,
          o.block_index, o.block_time, now
        )
    );
    await db.batch(stmts);
  }

  // Close orders that were open in our DB but not in the fresh set
  const openHashes = new Set(allOrders.map((o) => o.tx_hash));
  const dbOpen = await db
    .prepare(`SELECT tx_hash FROM orders WHERE status = 'open'`)
    .all<{ tx_hash: string }>();

  const toClose = dbOpen.results.filter((r) => !openHashes.has(r.tx_hash));

  for (let i = 0; i < toClose.length; i += 50) {
    const batch = toClose.slice(i, i + 50);
    const stmts = batch.map((r) =>
      db
        .prepare(
          `UPDATE orders SET status = 'closed', closed_at = ? WHERE tx_hash = ?`
        )
        .bind(now, r.tx_hash)
    );
    await db.batch(stmts);
  }

  // Update pair_stats with order book metrics
  const pairsWithOrders = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset,
              COUNT(*) as open_orders,
              SUM(CASE WHEN side = 'bid' THEN 1 ELSE 0 END) as bid_count,
              SUM(CASE WHEN side = 'ask' THEN 1 ELSE 0 END) as ask_count,
              MAX(CASE WHEN side = 'bid' THEN price END) as best_bid,
              MIN(CASE WHEN side = 'ask' THEN price END) as best_ask
       FROM orders WHERE status = 'open'
       GROUP BY pair`
    )
    .all<{
      pair: string;
      base_asset: string;
      quote_asset: string;
      open_orders: number;
      bid_count: number;
      ask_count: number;
      best_bid: number | null;
      best_ask: number | null;
    }>();

  for (let i = 0; i < pairsWithOrders.results.length; i += 50) {
    const batch = pairsWithOrders.results.slice(i, i + 50);
    const stmts = batch.map((p) => {
      const spread =
        p.best_bid && p.best_ask
          ? Math.max(0, ((p.best_ask - p.best_bid) / p.best_ask) * 100)
          : null;

      return db
        .prepare(
          `INSERT INTO pair_stats (pair, base_asset, quote_asset, open_orders, bid_count, ask_count, best_bid, best_ask, spread, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (pair) DO UPDATE SET
             open_orders = excluded.open_orders,
             bid_count = excluded.bid_count,
             ask_count = excluded.ask_count,
             best_bid = excluded.best_bid,
             best_ask = excluded.best_ask,
             spread = excluded.spread,
             updated_at = excluded.updated_at`
        )
        .bind(
          p.pair, p.base_asset, p.quote_asset,
          p.open_orders, p.bid_count, p.ask_count,
          p.best_bid, p.best_ask, spread, now
        );
    });
    await db.batch(stmts);
  }

  // Zero out stats for pairs that no longer have open orders
  await db
    .prepare(
      `UPDATE pair_stats SET open_orders = 0, bid_count = 0, ask_count = 0,
       best_bid = NULL, best_ask = NULL, spread = NULL
       WHERE open_orders > 0 AND pair NOT IN (
         SELECT DISTINCT pair FROM orders WHERE status = 'open'
       )`
    )
    .run();

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

    while (pages < 500) {
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
  for (let i = 0; i < allDispensers.length; i += 50) {
    const batch = allDispensers.slice(i, i + 50);
    const stmts = batch.map((d) =>
      db
        .prepare(
          `INSERT INTO dispensers
           (tx_hash, tx_index, asset, source, give_quantity, escrow_quantity,
            give_remaining, satoshi_price, price, dispense_count, status,
            block_index, block_time, oracle_address, first_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tx_hash) DO UPDATE SET
             give_remaining = excluded.give_remaining,
             escrow_quantity = excluded.escrow_quantity,
             dispense_count = excluded.dispense_count,
             status = excluded.status,
             closed_at = NULL`
        )
        .bind(
          d.tx_hash, d.tx_index, d.asset, d.source,
          d.give_quantity, d.escrow_quantity, d.give_remaining,
          d.satoshi_price, d.price, d.dispense_count, d.status,
          d.block_index, d.block_time, d.oracle_address, now
        )
    );
    await db.batch(stmts);
  }

  // Close dispensers that were open in our DB but not in the fresh set
  const openHashes = new Set(allDispensers.map((d) => d.tx_hash));
  const dbOpen = await db
    .prepare(`SELECT tx_hash FROM dispensers WHERE status < 10`)
    .all<{ tx_hash: string }>();

  const toClose = dbOpen.results.filter((r) => !openHashes.has(r.tx_hash));

  for (let i = 0; i < toClose.length; i += 50) {
    const batch = toClose.slice(i, i + 50);
    const stmts = batch.map((r) =>
      db
        .prepare(
          `UPDATE dispensers SET status = 10, closed_at = ? WHERE tx_hash = ?`
        )
        .bind(now, r.tx_hash)
    );
    await db.batch(stmts);
  }

  // Aggregate per-asset counts into dispenser_stats
  const assetAggs = await db
    .prepare(
      `SELECT asset,
              COUNT(*) as active_dispensers,
              COALESCE(SUM(give_remaining), 0) as total_available,
              MIN(CASE WHEN price > 0 THEN price END) as cheapest_price
       FROM dispensers WHERE status < 10
       GROUP BY asset`
    )
    .all<{
      asset: string;
      active_dispensers: number;
      total_available: number;
      cheapest_price: number | null;
    }>();

  for (let i = 0; i < assetAggs.results.length; i += 50) {
    const batch = assetAggs.results.slice(i, i + 50);
    const stmts = batch.map((a) =>
      db
        .prepare(
          `INSERT INTO dispenser_stats (asset, active_dispensers, total_available, cheapest_price, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (asset) DO UPDATE SET
             active_dispensers = excluded.active_dispensers,
             total_available = excluded.total_available,
             cheapest_price = excluded.cheapest_price,
             updated_at = excluded.updated_at`
        )
        .bind(a.asset, a.active_dispensers, a.total_available, a.cheapest_price, now)
    );
    await db.batch(stmts);
  }

  // Zero out stats for assets that no longer have open dispensers
  await db
    .prepare(
      `UPDATE dispenser_stats SET active_dispensers = 0, total_available = 0, cheapest_price = NULL
       WHERE active_dispensers > 0 AND asset NOT IN (
         SELECT DISTINCT asset FROM dispensers WHERE status < 10
       )`
    )
    .run();

  return { synced: allDispensers.length, closed: toClose.length };
}

/**
 * Run one sub-step of the snapshot sync.
 * Phase: orders → dispensers_0 → dispensers_1 → finalize → BUILD_AGGREGATES
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
    // Record chain tip BEFORE snapshotting to avoid a gap
    const res = await fetch(`${apiBase}/blocks/last`);
    if (!res.ok) throw new Error(`Failed to fetch last block: ${res.status}`);
    const data: { result: { block_index: number } } = await res.json();
    await setState(db, "last_block_index", String(data.result.block_index));

    const result = await syncOrders(db, apiBase);
    await setState(db, "snapshot_phase", "dispensers_0");
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

      const batch: NormalizedDispenser[] = [];
      for (const d of dispensers) {
        try {
          const norm = normalizeDispenser(d);
          if (norm) batch.push(norm);
        } catch (e) {
          console.error(`Failed to normalize dispenser ${d.tx_hash}:`, e);
        }
      }

      if (batch.length > 0) {
        for (let i = 0; i < batch.length; i += 50) {
          const chunk = batch.slice(i, i + 50);
          const stmts = chunk.map((d) =>
            db
              .prepare(
                `INSERT INTO dispensers
                 (tx_hash, tx_index, asset, source, give_quantity, escrow_quantity,
                  give_remaining, satoshi_price, price, dispense_count, status,
                  block_index, block_time, oracle_address, first_seen_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (tx_hash) DO UPDATE SET
                   give_remaining = excluded.give_remaining,
                   escrow_quantity = excluded.escrow_quantity,
                   dispense_count = excluded.dispense_count,
                   status = excluded.status,
                   closed_at = NULL`
              )
              .bind(
                d.tx_hash, d.tx_index, d.asset, d.source,
                d.give_quantity, d.escrow_quantity, d.give_remaining,
                d.satoshi_price, d.price, d.dispense_count, d.status,
                d.block_index, d.block_time, d.oracle_address, now
              )
          );
          await db.batch(stmts);
        }
        synced += batch.length;
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

    // Close dispensers that were open in our DB but not in the fresh set
    const openHashes = new Set(
      (await db
        .prepare(`SELECT tx_hash FROM dispensers WHERE status < 10`)
        .all<{ tx_hash: string }>()).results.map((r) => r.tx_hash)
    );

    // We just inserted all open dispensers. Any with status < 10 that we
    // didn't just upsert are stale. But since we upserted ALL open dispensers
    // from the API, the ones in DB are the correct set.
    // Actually — we need to detect ones that were previously open but are now
    // gone from the API. Since this is a fresh DB, there are no stale records.
    // Skip closure detection on initial sync.

    // Aggregate per-asset counts into dispenser_stats
    const assetAggs = await db
      .prepare(
        `SELECT asset,
                COUNT(*) as active_dispensers,
                COALESCE(SUM(give_remaining), 0) as total_available,
                MIN(CASE WHEN price > 0 THEN price END) as cheapest_price
         FROM dispensers WHERE status < 10
         GROUP BY asset`
      )
      .all<{
        asset: string;
        active_dispensers: number;
        total_available: number;
        cheapest_price: number | null;
      }>();

    for (let i = 0; i < assetAggs.results.length; i += 50) {
      const batch = assetAggs.results.slice(i, i + 50);
      const stmts = batch.map((a) =>
        db
          .prepare(
            `INSERT INTO dispenser_stats (asset, active_dispensers, total_available, cheapest_price, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (asset) DO UPDATE SET
               active_dispensers = excluded.active_dispensers,
               total_available = excluded.total_available,
               cheapest_price = excluded.cheapest_price,
               updated_at = excluded.updated_at`
          )
          .bind(a.asset, a.active_dispensers, a.total_available, a.cheapest_price, now)
      );
      await db.batch(stmts);
    }

    // Seed pair_stats for ALL traded pairs
    await db
      .prepare(
        `INSERT OR IGNORE INTO pair_stats (pair, base_asset, quote_asset)
         SELECT DISTINCT pair, base_asset, quote_asset FROM trades`
      )
      .run();

    await deleteState(db, "snapshot_phase");
    await setMode(db, "BUILD_AGGREGATES");

    await db
      .prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('aggregation_offset', '0')
         ON CONFLICT (key) DO NOTHING`
      )
      .run();

    const dispenserCount = await db
      .prepare(`SELECT COUNT(*) as cnt FROM dispensers WHERE status < 10`)
      .first<{ cnt: number }>();

    return { step: "finalize", dispensers: dispenserCount?.cnt ?? 0, mode: "BUILD_AGGREGATES" };
  }

  return { step: "unknown", phase };
}
