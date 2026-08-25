import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeVenueCandles } from "../src/routes/combined-ohlc";
import type { Candle } from "../src/routes/ohlc";

const c = (t: number, o: number, h: number, l: number, close: number, v: number, n: number): Candle => ({
  t, o, h, l, c: close, v, n,
});

describe("mergeVenueCandles", () => {
  it("passes a bucket only one venue traded in through untouched", () => {
    // The overwhelming majority of buckets: over the 365 days to 2026-08-25 the
    // XCP/BTC book traded 5 days and the dispensers 325, so they almost never
    // land in the same bucket and there is nothing to approximate.
    const book = [c(100, 1, 2, 0.5, 1.5, 10, 3)];
    const disp = [c(200, 5, 6, 4, 5.5, 20, 7)];
    assert.deepEqual(mergeVenueCandles(book, disp), [book[0], disp[0]]);
  });

  it("keeps the true extremes and totals when both venues trade a bucket", () => {
    const book = [c(100, 1, 3, 0.8, 2, 30, 2)];
    const disp = [c(100, 2, 9, 1.5, 4, 10, 8)];
    const [m] = mergeVenueCandles(book, disp);
    assert.equal(m!.h, 9, "high must be the higher of the two, not the book's");
    assert.equal(m!.l, 0.8, "low must be the lower of the two");
    assert.equal(m!.v, 40, "volume is the sum");
    assert.equal(m!.n, 10, "trade count is the sum");
    // Volume-weighted: book carries 30 of 40, dispensers 10.
    assert.equal(m!.o, (1 * 30 + 2 * 10) / 40);
    assert.equal(m!.c, (2 * 30 + 4 * 10) / 40);
  });

  it("weights the ends by volume, so the thin venue cannot drag the close", () => {
    // The failure this guards: the XCP/BTC book saw SIX fills in a year against
    // the dispensers' 1,635. A plain average of closes would hand a near-dead
    // venue half the say in the price.
    const book = [c(100, 1, 1, 1, 1, 1, 1)];
    const disp = [c(100, 10, 10, 10, 10, 999, 500)];
    const [m] = mergeVenueCandles(book, disp);
    assert.ok(m!.c > 9.9, `close should sit next to the deep venue, got ${m!.c}`);
    assert.notEqual(m!.c, 5.5, "a plain average would be 5.5 and would be wrong");
  });

  it("falls back to an even split when neither venue reports volume", () => {
    const [m] = mergeVenueCandles([c(100, 1, 1, 1, 1, 0, 1)], [c(100, 3, 3, 3, 3, 0, 1)]);
    assert.equal(m!.c, 2, "no weights means nothing to prefer — average, do not divide by zero");
    assert.ok(Number.isFinite(m!.o));
  });

  it("returns buckets in ascending time regardless of input order", () => {
    const merged = mergeVenueCandles(
      [c(300, 1, 1, 1, 1, 1, 1), c(100, 1, 1, 1, 1, 1, 1)],
      [c(200, 1, 1, 1, 1, 1, 1)],
    );
    assert.deepEqual(merged.map((x) => x.t), [100, 200, 300]);
  });
});
