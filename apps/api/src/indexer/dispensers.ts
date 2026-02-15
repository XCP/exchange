import { fetchDispensers, CounterpartyDispenser } from "../lib/counterparty";

// Counterparty dispenser status codes:
// 0 = open, 10 = closed
function normalizeDispenser(d: CounterpartyDispenser) {
  const giveQty = parseFloat(d.give_quantity_normalized);
  const escrowQty = parseFloat(d.escrow_quantity_normalized);
  const giveRemaining = parseFloat(d.give_remaining_normalized);
  // Use API's pre-computed price_normalized (satoshirate / give_quantity, in BTC)
  const price = parseFloat(d.price_normalized);

  return {
    tx_hash: d.tx_hash,
    tx_index: d.tx_index,
    asset: d.asset,
    source: d.source,
    give_quantity: giveQty,
    escrow_quantity: escrowQty,
    give_remaining: giveRemaining,
    satoshi_price: d.satoshi_price,
    price,
    dispense_count: d.dispense_count,
    status: d.status,
    block_index: d.block_index,
    block_time: d.block_time,
    oracle_address: d.oracle_address || null,
  };
}

export async function syncDispensers(
  db: D1Database,
  apiBase: string
): Promise<{ synced: number; closed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch ALL open dispensers from CP API (paginate through everything)
  const allDispensers: ReturnType<typeof normalizeDispenser>[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 500) {
    const { dispensers, nextCursor } = await fetchDispensers(
      apiBase,
      0,
      cursor
    );

    if (dispensers.length === 0) break;

    for (const d of dispensers) {
      try {
        allDispensers.push(normalizeDispenser(d));
      } catch (e) {
        console.error(`Failed to normalize dispenser ${d.tx_hash}:`, e);
      }
    }

    cursor = nextCursor;
    pages++;
    if (!nextCursor) break;
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
          d.tx_hash,
          d.tx_index,
          d.asset,
          d.source,
          d.give_quantity,
          d.escrow_quantity,
          d.give_remaining,
          d.satoshi_price,
          d.price,
          d.dispense_count,
          d.status,
          d.block_index,
          d.block_time,
          d.oracle_address,
          now
        )
    );
    await db.batch(stmts);
  }

  // Close dispensers that were open in our DB but not in the fresh set
  const openHashes = new Set(allDispensers.map((d) => d.tx_hash));
  const dbOpen = await db
    .prepare(`SELECT tx_hash FROM dispensers WHERE status = 0`)
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
              MIN(price) as cheapest_price
       FROM dispensers WHERE status = 0
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
        .bind(
          a.asset,
          a.active_dispensers,
          a.total_available,
          a.cheapest_price,
          now
        )
    );
    await db.batch(stmts);
  }

  // Zero out stats for assets that no longer have open dispensers
  await db
    .prepare(
      `UPDATE dispenser_stats SET active_dispensers = 0, total_available = 0, cheapest_price = NULL
       WHERE active_dispensers > 0 AND asset NOT IN (
         SELECT DISTINCT asset FROM dispensers WHERE status = 0
       )`
    )
    .run();

  return { synced: allDispensers.length, closed: toClose.length };
}
