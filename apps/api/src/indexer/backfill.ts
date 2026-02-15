import { normalizeOrderMatch, NormalizedTrade, normalizeDispensePrice } from "./normalize";
import { fetchDispenses } from "../lib/counterparty";
import { getMode, setMode, getState, setState, deleteState } from "./state";

const BATCH_SIZE = 200;
const DEFAULT_MAX_PAGES = 20;

interface BackfillResult {
  type: "trades" | "dispenses";
  inserted: number;
  pages: number;
  done: boolean;
  total: number;
  progress: string;
}

/**
 * Backfill trades from oldest → newest using offset/limit pagination.
 * When complete, transitions mode to BACKFILL_DISPENSES.
 */
export async function backfillTrades(
  db: D1Database,
  apiBase: string,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<BackfillResult> {
  const [totalStr, offsetStr] = await Promise.all([
    getState(db, "backfill_total"),
    getState(db, "backfill_offset"),
  ]);

  let total: number;
  let offset: number;

  if (totalStr != null && offsetStr != null) {
    total = parseInt(totalStr, 10);
    offset = parseInt(offsetStr, 10);
  } else {
    // First run — probe for total count
    const probeUrl = new URL(`${apiBase}/order_matches`);
    probeUrl.searchParams.set("status", "completed");
    probeUrl.searchParams.set("limit", "1");

    const probeRes = await fetch(probeUrl.toString());
    if (!probeRes.ok) {
      throw new Error(`Counterparty API probe error: ${probeRes.status} ${probeRes.statusText}`);
    }
    const probeData: { result_count: number } = await probeRes.json();
    total = probeData.result_count;

    // Start at the end (oldest trades)
    offset = Math.max(total - BATCH_SIZE, 0);

    await Promise.all([
      setState(db, "backfill_total", String(total)),
      setState(db, "backfill_offset", String(offset)),
    ]);
  }

  // Already done
  if (offset < 0) {
    await finishTradeBackfill(db);
    return { type: "trades", inserted: 0, pages: 0, done: true, total, progress: "100.0" };
  }

  let totalInserted = 0;
  let pages = 0;

  while (pages < maxPages && offset >= 0) {
    // For the final page, fetch only the remaining items at offset 0
    const fetchOffset = offset;
    const fetchLimit = offset < BATCH_SIZE ? offset + BATCH_SIZE : BATCH_SIZE;

    const fetchUrl = new URL(`${apiBase}/order_matches`);
    fetchUrl.searchParams.set("status", "completed");
    fetchUrl.searchParams.set("verbose", "true");
    fetchUrl.searchParams.set("limit", String(fetchLimit));
    fetchUrl.searchParams.set("offset", String(fetchOffset));

    const res = await fetch(fetchUrl.toString());
    if (!res.ok) {
      throw new Error(`Counterparty API error: ${res.status} ${res.statusText}`);
    }
    const data: { result: any[]; result_count: number } = await res.json();

    if (data.result.length === 0) break;

    const trades: NormalizedTrade[] = [];
    for (const match of data.result) {
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

      for (let i = 0; i < stmts.length; i += 50) {
        const results = await db.batch(stmts.slice(i, i + 50));
        for (const r of results) {
          if (r.meta.changes > 0) totalInserted++;
        }
      }
    }

    pages++;
    offset -= BATCH_SIZE;

    // Clamp to -1 sentinel so we don't persist large negative values
    if (offset < 0) offset = -1;
    await setState(db, "backfill_offset", String(offset));
  }

  const done = offset < 0;

  if (done) {
    await finishTradeBackfill(db);
  }

  const progress = total > 0 ? ((total - Math.max(offset, 0)) / total) * 100 : 100;

  return {
    type: "trades",
    inserted: totalInserted,
    pages,
    done,
    total,
    progress: progress.toFixed(1),
  };
}

async function finishTradeBackfill(db: D1Database): Promise<void> {
  // Batch cleanup + mode transition to avoid partial state on crash
  await db.batch([
    db.prepare(`DELETE FROM indexer_state WHERE key = 'backfill_total'`),
    db.prepare(`DELETE FROM indexer_state WHERE key = 'backfill_offset'`),
    db.prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'BACKFILL_DISPENSES')
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    ),
  ]);
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
    const probeRes = await fetch(probeUrl.toString());
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

      for (let i = 0; i < stmts.length; i += 50) {
        const results = await db.batch(stmts.slice(i, i + 50));
        for (const r of results) {
          if (r.meta.changes > 0) totalInserted++;
        }
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
    await Promise.all([
      deleteState(db, "dispense_backfill_cursor"),
      deleteState(db, "dispense_backfill_total"),
    ]);
    await setMode(db, "SNAPSHOT_SYNC");
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
