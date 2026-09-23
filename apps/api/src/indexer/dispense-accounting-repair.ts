import { accountDispensesInBlock } from "../lib/dispense-accounting";
import { updateDispenserStats } from "./dispenser-stats";

/** Recover the migration/deployment gap under syncBlocks' lock. Only committed
 * blocks are complete; partial blocks and historical pages must not be priced.
 * A durable marker survives a stats failure after the allocation has committed.
 * The empty partial index keeps the steady-state check cheap.
 */
export async function repairUnaccountedDispenses(db: D1Database, checkpoint: number): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const pending = await db.prepare(
      "SELECT value FROM indexer_state WHERE key = 'dispense_accounting_pending_block'"
    ).first<{ value: string }>();
    const next = pending ? { block_index: Number(pending.value) } : await db.prepare(
      `SELECT block_index FROM dispenses WHERE payment_asset_count = 0 AND block_index <= ?
       ORDER BY block_index LIMIT 1`
    ).bind(checkpoint).first<{ block_index: number }>();
    if (!next) return;
    await db.prepare(`INSERT OR REPLACE INTO indexer_state(key,value)
      VALUES ('dispense_accounting_pending_block', ?)`).bind(String(next.block_index)).run();
    await accountDispensesInBlock(db, next.block_index);
    const assets = await db.prepare("SELECT DISTINCT asset FROM dispenses WHERE block_index = ?")
      .bind(next.block_index).all<{ asset: string }>();
    for (const { asset } of assets.results) await updateDispenserStats(db, asset);
    await db.batch([
      db.prepare("DELETE FROM analytics_response_cache"),
      db.prepare(`DELETE FROM indexer_state WHERE key IN
        ('dispense_accounting_pending_block', 'deal_scores_refreshed_at')`),
    ]);
  }
}
