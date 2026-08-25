import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";

/**
 * The self-trade ratio, as stats.ts Q7 computes it.
 *
 * Kept as SQL rather than reimplemented, so a change to the real query that
 * forgets the pool exclusion fails here instead of quietly hiding markets.
 */
const SELF_TRADE_SQL = `
  SELECT pair,
         COALESCE(
           SUM(CASE WHEN source_type <> 'pool' AND maker = taker THEN 1.0 ELSE 0 END) * 100.0
             / NULLIF(SUM(CASE WHEN source_type <> 'pool' THEN 1 ELSE 0 END), 0),
           0
         ) AS self_trade_pct
  FROM trades GROUP BY pair`;

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE trades(pair TEXT, maker TEXT, taker TEXT, source_type TEXT)`);
  return d;
}
const add = (d: DatabaseSync, pair: string, maker: string, taker: string, src: string) =>
  d.exec(`INSERT INTO trades VALUES('${pair}','${maker}','${taker}','${src}')`);
const pct = (d: DatabaseSync, pair: string) =>
  Number((d.prepare(SELF_TRADE_SQL + ` HAVING pair='${pair}'`).get() as { self_trade_pct: number }).self_trade_pct);

describe("self-trade share", () => {
  it("does not count AMM swaps as wash trades", () => {
    // A pool swap's counterparty is the pool, which has no address, so the
    // indexer writes the trader into both sides. CAPTAINDAN's real shape:
    // 85 pool swaps by many different people, 8 clean book trades. The old
    // ratio read 91.4% and hid the market permanently.
    const d = db();
    for (let i = 0; i < 85; i += 1) add(d, "CAPTAINDAN_XCP", `addr${i}`, `addr${i}`, "pool");
    for (let i = 0; i < 8; i += 1) add(d, "CAPTAINDAN_XCP", `mk${i}`, `tk${i}`, "order");
    assert.equal(pct(d, "CAPTAINDAN_XCP"), 0);
    d.close();
  });

  it("still catches genuine wash trading on the book", () => {
    // The signal this metric exists for, and it must survive the fix.
    const d = db();
    for (let i = 0; i < 9; i += 1) add(d, "WASH_XCP", "same", "same", "order");
    add(d, "WASH_XCP", "alice", "bob", "order");
    assert.equal(pct(d, "WASH_XCP"), 90);
    d.close();
  });

  it("reports zero, not null, for a pool-only market", () => {
    // PEPEMEMECOIN_XCP: 43 pool swaps, no book trades at all. No book trades
    // means no evidence of self-dealing — absence of evidence must not arrive
    // downstream as an unknown that gets treated as suspicious.
    const d = db();
    for (let i = 0; i < 43; i += 1) add(d, "PEPEMEMECOIN_XCP", `a${i}`, `a${i}`, "pool");
    assert.equal(pct(d, "PEPEMEMECOIN_XCP"), 0);
    d.close();
  });

  it("ignores pool swaps when judging a market that is washed on the book", () => {
    // Mixed venue: the pool must neither create nor dilute the book signal.
    const d = db();
    for (let i = 0; i < 100; i += 1) add(d, "MIX_XCP", `p${i}`, `p${i}`, "pool");
    for (let i = 0; i < 6; i += 1) add(d, "MIX_XCP", "washer", "washer", "order");
    for (let i = 0; i < 4; i += 1) add(d, "MIX_XCP", `m${i}`, `t${i}`, "order");
    assert.equal(pct(d, "MIX_XCP"), 60);
    d.close();
  });
});
