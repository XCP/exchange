import { parseRawInteger } from "@xcp/wallet-sdk/amounts";

/** Bitcoin's entire monetary supply fits in a safe JS integer. */
export const MAX_SATS = 2_100_000_000_000_000n;

export function listingAmounts(body: Record<string, unknown>) {
  const integer = (field: string, min: bigint, max?: bigint) => {
    const value = body[field];
    if (typeof value !== "string" && typeof value !== "number") throw new Error(`${field} must be a raw integer`);
    try { return parseRawInteger(value, { min, max }); }
    catch { throw new Error(`${field} must be a plain integer in range`); }
  };
  return {
    utxo_vout: Number(integer("utxo_vout", 0n, 0xffffffffn)),
    price_sats: Number(integer("price_sats", 1n, MAX_SATS)),
    asset_quantity: integer("asset_quantity", 1n).toString(),
  };
}
