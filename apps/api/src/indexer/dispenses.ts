import { fetchDispenses, CounterpartyDispense } from "../lib/counterparty";
import { updateDispenserStats } from "./dispenser-stats";

const BATCH_SIZE = 200;
const DEFAULT_MAX_PAGES = 1000;

function normalizeDispense(d: CounterpartyDispense) {
  const qty = parseFloat(d.dispense_quantity_normalized);
  const btc = parseFloat(d.btc_amount_normalized);
  const price = qty > 0 ? btc / qty : 0;

  return {
    tx_hash: d.tx_hash,
    dispense_index: d.dispense_index,
    asset: d.asset,
    block_index: d.block_index,
    block_time: d.block_time,
    source: d.source,
    destination: d.destination,
    dispense_quantity: qty,
    btc_amount: btc,
    price,
    dispenser_tx_hash: d.dispenser_tx_hash,
  };
}

export async function runDispenseIndexer(
  db: D1Database,
  apiBase: string,
  maxPages: number = DEFAULT_MAX_PAGES,
  skipStats: boolean = false
): Promise<{ inserted: number; pages: number; done: boolean }> {
  // Read sync state
  const cursorRow = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'dispense_last_cursor'`)
    .first<{ value: string }>();
  let cursor = cursorRow?.value || null;

  let totalInserted = 0;
  let pages = 0;
  const affectedAssets = new Set<string>();

  while (pages < maxPages) {
    const { dispenses, nextCursor } = await fetchDispenses(
      apiBase,
      cursor,
      BATCH_SIZE
    );

    if (dispenses.length === 0) break;

    const normalized = [];
    for (const d of dispenses) {
      try {
        normalized.push(normalizeDispense(d));
      } catch (e) {
        console.error(`Failed to normalize dispense ${d.tx_hash}:`, e);
      }
    }

    // Batch insert (skip duplicates via IGNORE)
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
            d.tx_hash,
            d.dispense_index,
            d.asset,
            d.block_index,
            d.block_time,
            d.source,
            d.destination,
            d.dispense_quantity,
            d.btc_amount,
            d.price,
            d.dispenser_tx_hash
          )
      );

      // D1 batch limit ~100 statements
      for (let i = 0; i < stmts.length; i += 50) {
        const results = await db.batch(stmts.slice(i, i + 50));
        for (const r of results) {
          if (r.meta.changes > 0) totalInserted++;
        }
      }

      // Track affected assets for stats update
      for (const d of normalized) {
        affectedAssets.add(d.asset);
      }
    }

    cursor = nextCursor;
    pages++;

    // Save cursor after each page
    if (cursor) {
      await db
        .prepare(
          `INSERT INTO indexer_state (key, value) VALUES ('dispense_last_cursor', ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`
        )
        .bind(cursor)
        .run();
    } else {
      await db
        .prepare(`DELETE FROM indexer_state WHERE key = 'dispense_last_cursor'`)
        .run();
      break;
    }
  }

  // Update stats for affected assets (skip during backfill)
  if (!skipStats) {
    for (const asset of affectedAssets) {
      await updateDispenserStats(db, asset);
    }
  }

  // Save run time
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('dispense_last_run_time', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(String(Math.floor(Date.now() / 1000)))
    .run();

  return { inserted: totalInserted, pages, done: !cursor };
}
