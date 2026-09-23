/**
 * Allocate a BTC output once across all assets it dispensed, before filtering
 * by asset, collection or visibility. Preserve protocol notional when it is
 * below the payment (overpayment/depleted inventory is not trading volume).
 * Otherwise scale every asset's notional by the same payment/notional ratio.
 *
 * Core emits DISPENSE rows in vout order, then asset ASC, with a transaction-
 * wide dispense_index. A change of seller/buyer/payment or an asset-order
 * restart identifies the next output. This also preserves repeated identical
 * outputs to the same seller. Rows must include the WHOLE transaction; never
 * pass an asset, visibility or page filter here. Missing dispenser metadata
 * uses that row's payment as its weight, still capped at the output level.
 *
 * The stored columns make reads indexed and cheap; only ingestion/rebuild
 * executes window functions. The original btc_amount and price stay intact.
 */
export function repriceDispensesSQL(wholeTransactions = "1 = 1"): string {
  return `WITH ordered AS (
    SELECT d.id, d.tx_hash, d.dispense_index, d.asset, d.source, d.destination,
           d.btc_amount, d.dispense_quantity,
           MAX(0, d.dispense_quantity * COALESCE(p.price,
             CASE WHEN d.dispense_quantity > 0 THEN d.btc_amount / d.dispense_quantity ELSE 0 END)) AS notional,
           LAG(d.asset) OVER tx AS previous_asset,
           LAG(d.source) OVER tx AS previous_source,
           LAG(d.destination) OVER tx AS previous_destination,
           LAG(d.btc_amount) OVER tx AS previous_payment
    FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
    WHERE ${wholeTransactions}
    WINDOW tx AS (PARTITION BY d.tx_hash ORDER BY d.dispense_index)
  ), grouped AS (
    SELECT *, SUM(CASE WHEN previous_asset IS NULL OR asset <= previous_asset
                      OR source IS NOT previous_source OR destination IS NOT previous_destination
                      OR btc_amount IS NOT previous_payment THEN 1 ELSE 0 END)
              OVER (PARTITION BY tx_hash ORDER BY dispense_index ROWS UNBOUNDED PRECEDING) AS payment_group
    FROM ordered
  ), totals AS (
    SELECT *, SUM(notional) OVER payment AS total_notional,
           COUNT(*) OVER payment AS asset_count
    FROM grouped
    WINDOW payment AS (PARTITION BY tx_hash, payment_group)
  ), allocated AS (
    SELECT id, dispense_quantity, asset_count,
           CASE WHEN total_notional > 0
             THEN notional * MIN(1.0, MAX(0, btc_amount) / total_notional)
             ELSE 0 END AS volume
    FROM totals
  )
  UPDATE dispenses SET quote_volume = a.volume,
    execution_price = CASE WHEN a.dispense_quantity > 0 THEN a.volume / a.dispense_quantity ELSE 0 END,
    payment_asset_count = a.asset_count
  FROM allocated a WHERE dispenses.id = a.id`;
}

/** Block boundaries contain complete transactions, unlike upstream pages. */
export async function accountDispensesInBlock(db: D1Database, block: number): Promise<void> {
  await db.prepare(repriceDispensesSQL("d.block_index = ?")).bind(block).run();
}

/** Used only after the entire historical dispense and dispenser backfill. */
export async function accountAllDispenses(db: D1Database): Promise<void> {
  await db.prepare(repriceDispensesSQL()).run();
}
