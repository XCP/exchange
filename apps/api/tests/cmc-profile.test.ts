import assert from "node:assert/strict";
import { test } from "node:test";
import { COINMARKETCAP_PAIRS, includesOpenOrderBook } from "../src/lib/market-summary";
import { CMC_ASSET_IDS } from "../src/routes/coinmarketcap";

test("every CoinMarketCap profile asset has an exact UCID", () => {
  const assets = new Set(COINMARKETCAP_PAIRS.flatMap((pair) => pair.split("_")));
  for (const asset of assets) {
    assert.ok(Number.isInteger(CMC_ASSET_IDS[asset]), `${asset} must have a CMC UCID`);
  }
});

test("known symbol collisions stay outside the CoinMarketCap profile", () => {
  assert.equal(COINMARKETCAP_PAIRS.some((pair) => pair.startsWith("BITCORN_")), false);
  assert.equal(COINMARKETCAP_PAIRS.some((pair) => pair.startsWith("MAGICFLDC_")), false);
});

test("BTC-quoted books exclude uncommitted open orders", () => {
  assert.equal(includesOpenOrderBook("BTC"), false);
  assert.equal(includesOpenOrderBook("XCP"), true);
});
