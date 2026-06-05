import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateFeeApy,
  calculateFeeValueInQuote,
  calculatePoolFeePeriodReturnInQuote,
  calculatePoolPriceInQuote,
  calculatePoolValueInQuote,
  YEAR_SECONDS,
} from "../src/lib/pool-math";

function closeTo(actual: number | null, expected: number, tolerance = 1e-12) {
  assert.notEqual(actual, null);
  const value = actual as number;
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} was not within ${tolerance} of ${expected}`);
}

describe("pool math", () => {
  it("prices a pool from the reserve ratio", () => {
    assert.equal(calculatePoolPriceInQuote(100, 200), 2);
  });

  it("values the pool in quote terms", () => {
    assert.equal(calculatePoolValueInQuote(100, 200), 400);
  });

  it("values mixed-asset fees in quote terms", () => {
    assert.equal(calculateFeeValueInQuote(100, 200, 1, 2), 4);
  });

  it("calculates fee period return against current pool value", () => {
    assert.equal(calculatePoolFeePeriodReturnInQuote(100, 200, 1, 2), 0.01);
  });

  it("annualizes fee return as compounded Fee APY", () => {
    const periodReturn = 0.02;
    const windowSeconds = 30 * 24 * 60 * 60;
    closeTo(
      calculateFeeApy(periodReturn, windowSeconds),
      Math.pow(1 + periodReturn, YEAR_SECONDS / windowSeconds) - 1
    );
  });

  it("returns null when reserves or APY window are invalid", () => {
    assert.equal(calculatePoolPriceInQuote(0, 200), null);
    assert.equal(calculatePoolValueInQuote(100, 0), null);
    assert.equal(calculateFeeValueInQuote(0, 200, 1, 2), null);
    assert.equal(calculatePoolFeePeriodReturnInQuote(100, 0, 1, 2), null);
    assert.equal(calculateFeeApy(0.01, 0), null);
  });

  it("keeps period-return ordering equivalent to APY ordering for a fixed window", () => {
    const windowSeconds = 7 * 24 * 60 * 60;
    const smallerReturn = calculatePoolFeePeriodReturnInQuote(100, 100, 0, 1);
    const largerReturn = calculatePoolFeePeriodReturnInQuote(100, 100, 0, 2);
    assert.notEqual(smallerReturn, null);
    assert.notEqual(largerReturn, null);
    assert.ok(largerReturn! > smallerReturn!);
    assert.ok(calculateFeeApy(largerReturn, windowSeconds)! > calculateFeeApy(smallerReturn, windowSeconds)!);
  });
});
