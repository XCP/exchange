import assert from "node:assert/strict";
import { test } from "node:test";
import { listingAmounts } from "../src/lib/atomic-amounts";
import { verifyUtxoAsset } from "../src/lib/counterparty";
import { handlePrepareListingPsbt, handleCompleteListingPsbt, handlePrepareFill, handleCompleteFill } from "../src/routes/swaps";

test("atomic listing boundaries preserve raw quantities and limit BTC/vout fields", () => {
  const valid = { utxo_vout: "0", price_sats: "1000", asset_quantity: "10000000000000001" };
  assert.deepEqual(listingAmounts(valid), { utxo_vout: 0, price_sats: 1000, asset_quantity: "10000000000000001" });
  for (const field of ["utxo_vout", "price_sats", "asset_quantity"]) {
    for (const value of ["1e5", "-1", "1.5", "1,000", " 1", true, null, 9007199254740992]) {
      let rejected = false;
      try { listingAmounts({ ...valid, [field]: value }); } catch { rejected = true; }
      assert.ok(rejected, `${field} accepted ${String(value)}`);
    }
  }
  for (const invalid of [{ price_sats: "2100000000000001" }, { utxo_vout: "4294967296" }, { asset_quantity: "9223372036854775808" }]) {
    let rejected = false;
    try { listingAmounts({ ...valid, ...invalid }); } catch { rejected = true; }
    assert.ok(rejected);
  }
});

test("atomic inventory verification uses exact raw JSON and the asset's divisibility", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"result":[{"asset":"ASSET","quantity":10000000000000001,"quantity_normalized":"100000000.00000000","asset_info":{"divisible":true}}]}');
    const exact = await verifyUtxoAsset("https://fixture.invalid", "txid", 0, "ASSET", "10000000000000001");
    assert.deepEqual(exact, { verified: true, quantity: "10000000000000001", quantity_normalized: "100000000.00000001" });
    assert.equal((await verifyUtxoAsset("https://fixture.invalid", "txid", 0, "ASSET", "1")).verified, false);
    globalThis.fetch = async () => new Response('{"result":[{"asset":"ASSET","quantity":100,"asset_info":{"divisible":false}}]}');
    assert.equal((await verifyUtxoAsset("https://fixture.invalid", "txid", 0, "ASSET", "100")).quantity_normalized, "100");
    globalThis.fetch = async () => new Response('{"result":[{"asset":"ASSET","quantity":100}]}');
    assert.equal((await verifyUtxoAsset("https://fixture.invalid", "txid", 0, "ASSET", "100")).verified, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("direct atomic HTTP requests reject malformed fields before fetching or touching storage", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  const env = { DB: { prepare() { calls++; throw new Error("unexpected database"); } } } as unknown as Parameters<typeof handlePrepareListingPsbt>[1];
  try {
    for (const handler of [handlePrepareListingPsbt, handleCompleteListingPsbt]) {
      for (const invalid of [{ price_sats: "1e5" }, { price_sats: "1000.5" }, { utxo_vout: "0x1" }, { asset_quantity: 9007199254740992 }]) {
        const request = new Request("https://fixture.invalid/swaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller_address: "seller", utxo_txid: "a".repeat(64), utxo_vout: 0, asset: "ASSET", asset_quantity: "100", price_sats: "1000", ...invalid }) });
        assert.equal((await handler(request, env)).status, 400);
      }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("new and already-pending atomic purchases cannot reach locks, signing, or broadcast", async () => {
  const env = { DB: { prepare() { throw new Error("database must not be touched"); } } } as unknown as Parameters<typeof handlePrepareFill>[1];
  for (const handler of [
    (request: Request) => handlePrepareFill(request, env, "listing-id"),
    (request: Request) => handleCompleteFill(request, env.DB, "listing-id"),
  ]) {
    const response = await handler(new Request("https://fixture.invalid/swaps", { method: "POST", body: "{}" }));
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, "atomic_delivery_unavailable");
  }
});
