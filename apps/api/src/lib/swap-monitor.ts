// Swap confirmation monitor — checks pending fills for blockchain confirmation
// and detects anomalous UTXO spends on active listings.

const MEMPOOL_API = "https://mempool.space/api";
const BLOCKSTREAM_API = "https://blockstream.info/api";

// Max items per cron tick to avoid rate limits
const MAX_PENDING_CHECKS = 10;
const MAX_UTXO_CHECKS = 20;
// If a broadcast tx isn't confirmed within 30 minutes, re-list
const PENDING_TIMEOUT_MS = 30 * 60 * 1000;

interface TxStatus {
  confirmed: boolean;
  block_height?: number;
  block_time?: number;
}

interface TxInfo {
  txid: string;
  status: TxStatus;
}

async function fetchTxStatus(txid: string): Promise<TxInfo | null> {
  try {
    const res = await fetch(`${MEMPOOL_API}/tx/${txid}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return await res.json();
  } catch {
    // fallthrough
  }

  try {
    const res = await fetch(`${BLOCKSTREAM_API}/tx/${txid}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return await res.json();
  } catch {
    // both failed
  }

  return null;
}

interface UtxoStatus {
  spent: boolean;
  txid?: string;
}

async function checkUtxoSpent(txid: string, vout: number): Promise<UtxoStatus> {
  try {
    const res = await fetch(`${MEMPOOL_API}/tx/${txid}/outspend/${vout}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data: { spent: boolean; txid?: string } = await res.json();
      return data;
    }
  } catch {
    // fallthrough
  }

  try {
    const res = await fetch(`${BLOCKSTREAM_API}/tx/${txid}/outspend/${vout}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data: { spent: boolean; txid?: string } = await res.json();
      return data;
    }
  } catch {
    // both failed
  }

  return { spent: false };
}

/**
 * Check pending fills for blockchain confirmation.
 * Called from the scheduled() cron handler.
 */
export async function checkPendingFills(
  db: D1Database
): Promise<{ confirmed: number; relisted: number; anomalous: number }> {
  let confirmed = 0;
  let relisted = 0;
  let anomalous = 0;

  // Phase 1: Check pending_fill listings for confirmation
  const pendingListings = await db
    .prepare(
      `SELECT id, broadcast_txid, updated_at
       FROM swap_listings
       WHERE status = 'pending_fill' AND broadcast_txid IS NOT NULL
       ORDER BY updated_at ASC
       LIMIT ?`
    )
    .bind(MAX_PENDING_CHECKS)
    .all<{ id: string; broadcast_txid: string; updated_at: string }>();

  for (const listing of pendingListings.results) {
    const txInfo = await fetchTxStatus(listing.broadcast_txid);

    if (txInfo && txInfo.status.confirmed) {
      // Confirmed — mark as filled, clear psbt_hex now that it's spent
      await db.batch([
        db
          .prepare(
            `UPDATE swap_listings
             SET status = 'filled', psbt_hex = NULL, locked_until = NULL, updated_at = datetime('now')
             WHERE id = ? AND status = 'pending_fill'`
          )
          .bind(listing.id),
        db
          .prepare(
            `UPDATE swap_fills
             SET confirmed_at = datetime('now')
             WHERE swap_listing_id = ? AND confirmed_at IS NULL`
          )
          .bind(listing.id),
      ]);
      confirmed++;
    } else if (!txInfo) {
      // TX not found — check if it's been long enough to re-list
      const updatedAt = new Date(listing.updated_at + "Z").getTime();
      if (Date.now() - updatedAt > PENDING_TIMEOUT_MS) {
        await db.batch([
          db
            .prepare(
              `UPDATE swap_listings
               SET status = 'active', broadcast_txid = NULL, buyer_address = NULL,
                   tx_id = NULL, locked_until = NULL, updated_at = datetime('now')
               WHERE id = ? AND status = 'pending_fill'`
            )
            .bind(listing.id),
          db
            .prepare(
              `UPDATE swap_fills
               SET status = 'expired'
               WHERE swap_listing_id = ? AND status = 'pending'`
            )
            .bind(listing.id),
        ]);
        relisted++;
      }
    }
    // else: still in mempool, do nothing — check next tick
  }

  // Phase 2: Spot-check active listings for spent UTXOs
  const activeListings = await db
    .prepare(
      `SELECT id, utxo_txid, utxo_vout, tx_id
       FROM swap_listings
       WHERE status = 'active'
       ORDER BY updated_at ASC
       LIMIT ?`
    )
    .bind(MAX_UTXO_CHECKS)
    .all<{ id: string; utxo_txid: string; utxo_vout: number; tx_id: string | null }>();

  for (const listing of activeListings.results) {
    const utxoStatus = await checkUtxoSpent(listing.utxo_txid, listing.utxo_vout);
    if (utxoStatus.spent) {
      // UTXO was spent outside our platform
      await db
        .prepare(
          `UPDATE swap_listings
           SET status = 'anomalous', tx_id = ?, updated_at = datetime('now')
           WHERE id = ? AND status = 'active'`
        )
        .bind(utxoStatus.txid ?? null, listing.id)
        .run();
      anomalous++;
    }
  }

  return { confirmed, relisted, anomalous };
}
