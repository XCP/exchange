import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUsdAnchors } from "../src/lib/usd-price";

test("parses the exchange/explorer USD anchor response", () => {
  assert.deepEqual(parseUsdAnchors({ result: { xcp: { usd: 4.5 }, btc: { usd: 75_000 } } }), {
    XCP: 4.5,
    BTC: 75_000,
  });
});

test("rejects missing and nonpositive USD anchors", () => {
  assert.deepEqual(parseUsdAnchors({ result: { xcp: { usd: 0 }, btc: { usd: "75000" } } }), {
    XCP: null,
    BTC: null,
  });
});
