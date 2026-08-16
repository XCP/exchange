import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rollUp, type DispenseRow } from "../src/routes/dispense-ohlc";
import { buildGrid } from "../src/routes/ohlc";
import { calendarBucket } from "../src/lib/constants";

/**
 * Real XCP dispenses pulled from the live API, oldest-first — the order the
 * route's query returns them in. Two consecutive UTC days, so the roll-up has
 * to split them rather than average them together.
 */
const REAL: DispenseRow[] = [
  { block_time: 1786721133, price: 0.0000346, dispense_quantity: 65 },
  { block_time: 1786729201, price: 0.000034, dispense_quantity: 2 },
  { block_time: 1786761453, price: 0.0000345, dispense_quantity: 30 },
  { block_time: 1786784297, price: 0.0000345, dispense_quantity: 84 },
  { block_time: 1786798339, price: 0.0000345, dispense_quantity: 7 },
  { block_time: 1786812078, price: 0.000035, dispense_quantity: 6 },
];

const DAY_ONE = calendarBucket(1786721133, "1d");
const DAY_TWO = calendarBucket(1786761453, "1d");

describe("dispense roll-up", () => {
  it("splits real dispenses into their calendar days", () => {
    const candles = rollUp(REAL, "1d");
    assert.equal(candles.length, 2);
    assert.notEqual(DAY_ONE, DAY_TWO);
    assert.deepEqual(
      candles.map((c) => c.t),
      [DAY_ONE, DAY_TWO]
    );
  });

  it("opens on the first sale of the day and closes on the last", () => {
    const [first, second] = rollUp(REAL, "1d");
    // Rows arrive oldest-first, so close must be the NEWEST price, not the
    // last row seen in some other order.
    assert.equal(first.o, 0.0000346);
    assert.equal(first.c, 0.000034);
    assert.equal(second.o, 0.0000345);
    assert.equal(second.c, 0.000035);
  });

  it("tracks the high and low across the day", () => {
    const [first, second] = rollUp(REAL, "1d");
    assert.equal(first.h, 0.0000346);
    assert.equal(first.l, 0.000034);
    assert.equal(second.h, 0.000035);
    assert.equal(second.l, 0.0000345);
  });

  it("sums token volume and counts sales", () => {
    const [first, second] = rollUp(REAL, "1d");
    assert.equal(first.v, 67);
    assert.equal(first.n, 2);
    assert.equal(second.v, 127);
    assert.equal(second.n, 4);
  });

  it("keeps a single sale as a flat candle", () => {
    const [only] = rollUp([REAL[0]], "1d");
    assert.equal(only.o, only.c);
    assert.equal(only.h, only.l);
    assert.equal(only.n, 1);
  });

  it("collapses both days into one bucket at a coarser interval", () => {
    const monthly = rollUp(REAL, "1m");
    assert.equal(monthly.length, 1);
    assert.equal(monthly[0].n, REAL.length);
    assert.equal(monthly[0].v, 194);
    assert.equal(monthly[0].o, 0.0000346);
    assert.equal(monthly[0].c, 0.000035);
  });

  it("returns nothing for an asset that has never dispensed", () => {
    assert.deepEqual(rollUp([], "1d"), []);
  });

  /**
   * The query deliberately reads NEWEST-first so a row-cap drops old history
   * instead of the latest sales, and the handler reverses before calling
   * this. That reversal is load-bearing: fed the raw descending order, open
   * and close come out swapped, which is a silently wrong candle rather than
   * an obviously broken one. This pins the contract.
   */
  it("depends on oldest-first input for open and close", () => {
    const [correct] = rollUp(REAL.slice(2), "1d");
    const [reversed] = rollUp([...REAL.slice(2)].reverse(), "1d");

    assert.equal(correct.o, reversed.c);
    assert.equal(correct.c, reversed.o);
    // High, low, volume and count survive either order — only o/c are at risk,
    // which is exactly why the mistake would be easy to miss.
    assert.equal(correct.h, reversed.h);
    assert.equal(correct.l, reversed.l);
    assert.equal(correct.v, reversed.v);
    assert.equal(correct.n, reversed.n);
  });
});

describe("dispense candles on the shared grid", () => {
  it("carries the last close across days with no sales", () => {
    // Skip DAY_TWO entirely: one sale, then a three-day gap.
    const sparse = rollUp([REAL[0]], "1d");
    const grid = buildGrid(sparse, null, DAY_ONE, DAY_ONE + 86400 * 3, "1d");

    assert.equal(grid.length, 4);
    assert.equal(grid[0].n, 1);
    for (const filler of grid.slice(1)) {
      // A day with no dispenses is flat at the last price and has no volume —
      // it must not read as a sale that never happened.
      assert.equal(filler.c, REAL[0].price);
      assert.equal(filler.o, REAL[0].price);
      assert.equal(filler.v, 0);
      assert.equal(filler.n, 0);
    }
  });

  it("seeds from the last sale before the window", () => {
    const grid = buildGrid([], 0.00009, DAY_ONE, DAY_ONE + 86400, "1d");
    assert.equal(grid.length, 2);
    assert.ok(grid.every((c) => c.c === 0.00009 && c.n === 0));
  });

  it("skips leading buckets when there is no price yet", () => {
    // An asset whose first ever dispense is mid-window has no earlier price
    // to carry forward, so those buckets are omitted rather than zero-filled.
    const late = rollUp([{ block_time: DAY_ONE + 86400, price: 0.5, dispense_quantity: 1 }], "1d");
    const grid = buildGrid(late, null, DAY_ONE, DAY_ONE + 86400, "1d");
    assert.equal(grid.length, 1);
    assert.equal(grid[0].c, 0.5);
  });
});
