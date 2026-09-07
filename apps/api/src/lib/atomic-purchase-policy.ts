/**
 * Release hold: Core 67e10db3 parser/gettxinfo.py:481-492 and :525-536 sends
 * balances from spent asset UTXOs to the first non-OP_RETURN output. The
 * current atomic buyer template pays the seller at output 0 and places the
 * buyer carrier at output 1, so it cannot deliver the purchased asset.
 * Re-enable only with a reviewed replacement layout and end-to-end Core
 * delivery/signature fixtures, including existing signed listing migration.
 */
export const ATOMIC_DELIVERY_ERROR_CODE = "atomic_delivery_unavailable";
export const ATOMIC_DELIVERY_UNAVAILABLE =
  "Atomic purchases are temporarily unavailable while the asset-delivery transaction layout is corrected.";

export function assertAtomicPurchasesAvailable(): void {
  throw new Error(ATOMIC_DELIVERY_UNAVAILABLE);
}
