import { normalizeOrderMatch, NormalizedTrade, normalizeDispensePrice, normalizeDispenser, buildDispenserUpsertStmt } from "./normalize";
import { fetchOrderMatches, fetchDispenses, fetchDispensers } from "../lib/counterparty";
import { API_TIMEOUT_MS } from "../lib/constants";
import { batchExec } from "../lib/batch";
import { getState, setState } from "./state";

const BATCH_SIZE = 200;
const DEFAULT_MAX_PAGES = 20;

interface BackfillResult {
  type: "trades" | "dispenses" | "dispensers";
  inserted: number;
  pages: number;
  done: boolean;
  total: number;
  progress: string;
}

/**
 * Backfill trades using cursor-based pagination.
 * When complete, transitions mode to BACKFILL_DISPENSES.
 */
export async function backfillTrades(
  db: D1Database,
  apiBase: string,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<BackfillResult> {
  let cursor = await getState(db, "trade_backfill_cursor");
  const totalStr = await getState(db, "trade_backfill_total");

  let total: number;
  if (totalStr != null) {
    total = parseInt(totalStr, 10);
  } else {
    // Probe for total count (for progress tracking)
    const probeUrl = new URL(`${apiBase}/order_matches`);
    probeUrl.searchParams.set("status", "completed");
    probeUrl.searchParams.set("limit", "1");
    const probeRes = await fetch(probeUrl.toString(), { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!probeRes.ok) {
      throw new Error(`Counterparty API probe error: ${probeRes.status} ${probeRes.statusText}`);
    }
    const probeData: { result_count: number } = await probeRes.json();
    total = probeData.result_count;
    await setState(db, "trade_backfill_total", String(total));
  }

  let totalInserted = 0;
  let pages = 0;

  while (pages < maxPages) {
    const { matches, nextCursor } = await fetchOrderMatches(
      apiBase,
      cursor,
      BATCH_SIZE
    );

    if (matches.length === 0) break;

    const trades: NormalizedTrade[] = [];
    for (const match of matches) {
      try {
        trades.push(normalizeOrderMatch(match));
      } catch (e) {
        console.error(`Failed to normalize match ${match.id}:`, e);
      }
    }

    if (trades.length > 0) {
      const stmts = trades.map((t) =>
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
          )
      );

      const results = await batchExec(db, stmts);
      for (const r of results) {
        if (r.meta.changes > 0) totalInserted++;
      }
    }

    cursor = nextCursor;
    pages++;

    if (cursor) {
      await setState(db, "trade_backfill_cursor", cursor);
    } else {
      break;
    }
  }

  const done = !cursor;

  if (done) {
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'trade_backfill_cursor'`),
      db.prepare(`DELETE FROM indexer_state WHERE key = 'trade_backfill_total'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'BACKFILL_DISPENSES')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
  }

  // Estimate progress from inserted count
  const insertedSoFar = await db
    .prepare(`SELECT COUNT(*) as cnt FROM trades`)
    .first<{ cnt: number }>();
  const progress = total > 0
    ? ((insertedSoFar?.cnt ?? 0) / total) * 100
    : 100;

  return {
    type: "trades",
    inserted: totalInserted,
    pages,
    done,
    total,
    progress: progress.toFixed(1),
  };
}

/**
 * Backfill dispenses using cursor-based pagination.
 * When complete, transitions mode to SNAPSHOT_SYNC.
 */
export async function backfillDispenses(
  db: D1Database,
  apiBase: string,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<BackfillResult> {
  let cursor = await getState(db, "dispense_backfill_cursor");
  const totalStr = await getState(db, "dispense_backfill_total");

  let total: number;
  if (totalStr != null) {
    total = parseInt(totalStr, 10);
  } else {
    // Probe for total count
    const probeUrl = new URL(`${apiBase}/dispenses`);
    probeUrl.searchParams.set("limit", "1");
    const probeRes = await fetch(probeUrl.toString(), { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!probeRes.ok) {
      throw new Error(`Counterparty API probe error: ${probeRes.status} ${probeRes.statusText}`);
    }
    const probeData: { result_count: number } = await probeRes.json();
    total = probeData.result_count;
    await setState(db, "dispense_backfill_total", String(total));
  }

  let totalInserted = 0;
  let pages = 0;

  while (pages < maxPages) {
    const { dispenses, nextCursor } = await fetchDispenses(
      apiBase,
      cursor,
      BATCH_SIZE
    );

    if (dispenses.length === 0) break;

    const normalized = dispenses.map((d) => {
      const qty = parseFloat(d.dispense_quantity_normalized);
      const btc = parseFloat(d.btc_amount_normalized);
      return { ...d, dispense_quantity: qty, btc_amount: btc, price: normalizeDispensePrice(qty, btc) };
    });

    if (normalized.length > 0) {
      const stmts = normalized.map((d) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO dispenses
             (tx_hash, dispense_index, asset, block_index, block_time,
              source, destination, dispense_quantity, btc_amount, price, dispenser_tx_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            d.tx_hash, d.dispense_index, d.asset,
            d.block_index, d.block_time, d.source, d.destination,
            d.dispense_quantity, d.btc_amount, d.price, d.dispenser_tx_hash
          )
      );

      const results = await batchExec(db, stmts);
      for (const r of results) {
        if (r.meta.changes > 0) totalInserted++;
      }
    }

    cursor = nextCursor;
    pages++;

    if (cursor) {
      await setState(db, "dispense_backfill_cursor", cursor);
    } else {
      break;
    }
  }

  const done = !cursor;

  if (done) {
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'dispense_backfill_cursor'`),
      db.prepare(`DELETE FROM indexer_state WHERE key = 'dispense_backfill_total'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'BACKFILL_DISPENSERS')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
  }

  // Estimate progress from inserted count
  const insertedSoFar = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dispenses`)
    .first<{ cnt: number }>();
  const progress = total > 0
    ? ((insertedSoFar?.cnt ?? 0) / total) * 100
    : 100;

  return {
    type: "dispenses",
    inserted: totalInserted,
    pages,
    done,
    total,
    progress: progress.toFixed(1),
  };
}

/**
 * Backfill ALL dispensers (open, closed, closing) using cursor-based pagination.
 * When complete, transitions mode to SNAPSHOT_SYNC.
 */
export async function backfillDispensers(
  db: D1Database,
  apiBase: string,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<BackfillResult> {
  let cursor = await getState(db, "dispenser_backfill_cursor");
  const totalStr = await getState(db, "dispenser_backfill_total");

  let total: number;
  if (totalStr != null) {
    total = parseInt(totalStr, 10);
  } else {
    const probeUrl = new URL(`${apiBase}/dispensers`);
    probeUrl.searchParams.set("limit", "1");
    const probeRes = await fetch(probeUrl.toString(), { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!probeRes.ok) {
      throw new Error(`Counterparty API probe error: ${probeRes.status} ${probeRes.statusText}`);
    }
    const probeData: { result_count: number } = await probeRes.json();
    total = probeData.result_count;
    await setState(db, "dispenser_backfill_total", String(total));
  }

  let totalInserted = 0;
  let pages = 0;
  const now = Math.floor(Date.now() / 1000);

  while (pages < maxPages) {
    const { dispensers, nextCursor } = await fetchDispensers(
      apiBase,
      null,
      cursor,
      BATCH_SIZE
    );

    if (dispensers.length === 0) break;

    const stmts: D1PreparedStatement[] = [];
    for (const raw of dispensers) {
      const d = normalizeDispenser(raw);
      if (!d) continue; // skip oracle dispensers
      stmts.push(buildDispenserUpsertStmt(db, d, now));
    }

    if (stmts.length > 0) {
      const results = await batchExec(db, stmts);
      for (const r of results) {
        if (r.meta.changes > 0) totalInserted++;
      }
    }

    cursor = nextCursor;
    pages++;

    if (cursor) {
      await setState(db, "dispenser_backfill_cursor", cursor);
    } else {
      break;
    }
  }

  const done = !cursor;

  if (done) {
    await db.batch([
      db.prepare(`DELETE FROM indexer_state WHERE key = 'dispenser_backfill_cursor'`),
      db.prepare(`DELETE FROM indexer_state WHERE key = 'dispenser_backfill_total'`),
      db.prepare(
        `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'SNAPSHOT_SYNC')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      ),
    ]);
  }

  const insertedSoFar = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dispensers`)
    .first<{ cnt: number }>();
  const progress = total > 0
    ? ((insertedSoFar?.cnt ?? 0) / total) * 100
    : 100;

  return {
    type: "dispensers",
    inserted: totalInserted,
    pages,
    done,
    total,
    progress: progress.toFixed(1),
  };
}
