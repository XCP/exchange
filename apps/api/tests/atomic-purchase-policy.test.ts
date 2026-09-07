import assert from "node:assert/strict";
import { test } from "node:test";
import { constructBuyerPsbt } from "../src/lib/psbt-construct";
import { ATOMIC_DELIVERY_UNAVAILABLE } from "../src/lib/atomic-purchase-policy";

test("direct buyer construction cannot create the seller-first asset-delivery layout", async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("unexpected fetch"); };
  try {
    let failure: unknown;
    try {
      await constructBuyerPsbt({ listing: { psbt_hex: "", utxo_txid: "ab".repeat(32), utxo_vout: 0, price_sats: 1000, seller_address: "seller" }, buyerAddress: "buyer", feeRate: 0.1 });
    } catch (error) { failure = error; }
    assert.equal(failure instanceof Error ? failure.message : null, ATOMIC_DELIVERY_UNAVAILABLE);
    assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
