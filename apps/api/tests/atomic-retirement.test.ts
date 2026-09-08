import assert from "node:assert/strict";
import { test } from "node:test";
import { retiredSwapRoutes } from "../src/routes/swaps";

test("all former atomic mutation endpoints return Gone without storage or network", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network must not be touched"); };
  try {
    for (const path of ["prepare-listing", "complete-listing", "listing-id/prepare-fill", "listing-id/complete-fill", "listing-id/prepare-cancel", "listing-id/cancel"]) {
      const response = await retiredSwapRoutes.request(`https://fixture.invalid/${path}`, { method: "POST", body: "{}" });
      assert.equal(response.status, 410, path);
      assert.equal((await response.json() as { code: string }).code, "atomic_trading_retired");
    }
  } finally { globalThis.fetch = originalFetch; }
});
