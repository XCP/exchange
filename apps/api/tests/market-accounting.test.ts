import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  COINGECKO_PAIRS,
  COINMARKETCAP_PAIRS,
  DISPENSE_AGG_SQL,
  INTEGRATION_PAIRS,
  dec,
  decPrice,
} from "../src/lib/market-summary";

/**
 * Regression fixture for the real shared-payment pathology discovered in
 * production (tx 0011db54…): one 0.00328984 BTC output triggered dispensers
 * for 20 different assets at one address, and Counterparty stamped the FULL
 * payment on every resulting dispense row. Naive SUM(btc_amount) books the
 * payment 20 times; the protocol-notional accounting must not.
 */

const PAYMENT_BTC = 0.00328984;
const SHARED_TX = "0011db54";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE dispenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT NOT NULL,
      dispense_index INTEGER NOT NULL,
      asset TEXT NOT NULL,
      block_time INTEGER NOT NULL,
      dispense_quantity REAL NOT NULL,
      btc_amount REAL NOT NULL,
      price REAL NOT NULL,
      dispenser_tx_hash TEXT NOT NULL,
      UNIQUE (tx_hash, dispense_index)
    );
    CREATE TABLE dispensers (tx_hash TEXT PRIMARY KEY, price REAL NOT NULL);
  `);

  const addDispenser = db.prepare(`INSERT INTO dispensers VALUES (?,?)`);
  const addDispense = db.prepare(`INSERT INTO dispenses
    (tx_hash, dispense_index, asset, block_time, dispense_quantity, btc_amount, price, dispenser_tx_hash)
    VALUES (?,?,?,?,?,?,?,?)`);

  // Twenty single-card dispensers, each protocol-priced at 0.0001 BTC/card.
  // Every dispense row carries the FULL shared payment and an inflated
  // stored per-row price (payment / quantity), exactly as ingested.
  for (let i = 0; i < 20; i++) {
    const dispenserTx = `disp${i}`;
    addDispenser.run(dispenserTx, 0.0001);
    addDispense.run(SHARED_TX, i, `CARD${i}`, 1_786_600_000, 1, PAYMENT_BTC, PAYMENT_BTC, dispenserTx);
  }
  return db;
}

test("one shared BTC payment across 20 dispensers books protocol notional, not payment x 20", () => {
  const db = fixture();
  const rows = db
    .prepare(DISPENSE_AGG_SQL(Array.from({ length: 20 }, () => "?").join(",")))
    .all(...Array.from({ length: 20 }, (_, i) => `CARD${i}`), 0) as Array<{
    asset: string;
    bv: number;
    qv: number;
    high: number;
    low: number;
  }>;

  assert.equal(rows.length, 20);
  const venueQuote = rows.reduce((sum, row) => sum + row.qv, 0);
  // Each market: 1 card x 0.0001 BTC. Venue-wide: 0.002 BTC, NOT 20 x payment.
  for (const row of rows) {
    assert.equal(row.qv, 0.0001, `${row.asset} books its own protocol notional`);
    assert.equal(row.high, 0.0001, `${row.asset} price is the dispenser rate, not payment/qty`);
  }
  assert.equal(Number(venueQuote.toFixed(8)), 0.002);
  assert.notEqual(Number(venueQuote.toFixed(8)), Number((PAYMENT_BTC * 20).toFixed(8)));
  db.close();
});

test("a dispense whose dispenser row is gone falls back to the stored per-row price", () => {
  const db = fixture();
  db.prepare(`INSERT INTO dispenses VALUES (NULL,'solo',0,'LONER',1786600000,2,0.0002,0.0001,'missing')`).run();
  const rows = db.prepare(DISPENSE_AGG_SQL("?")).all("LONER", 0) as Array<{ qv: number }>;
  assert.equal(rows[0].qv, 0.0002); // 2 units x stored 0.0001/unit
  db.close();
});

test("prices serialize full precision and never scientific notation; quantities stay 8dp", () => {
  assert.equal(decPrice(1.3e-7), "0.00000013");
  assert.equal(decPrice(0.00000000001), "0.00000000001"); // 1 sat per 1,000 units survives
  assert.equal(decPrice(0.00405505), "0.00405505");
  assert.equal(decPrice(0), "0");
  assert.equal(decPrice(null), "0");
  assert.equal(dec(1000), "1000.00000000");
  assert.equal(dec(0.00441623), "0.00441623");
});

test("aggregators have independent pair profiles backed by one catalog union", () => {
  // CoinGecko starts with only the unambiguous XCP/BTC market. Narrowing that
  // submission profile must not remove CMC's verified historical markets.
  assert.notEqual(COINMARKETCAP_PAIRS, COINGECKO_PAIRS);
  assert.deepEqual(COINGECKO_PAIRS, ["XCP_BTC"]);
  assert.equal(COINMARKETCAP_PAIRS.includes("PEPECASH_XCP"), true);
  assert.equal(COINGECKO_PAIRS.includes("PEPECASH_XCP"), false);
  assert.deepEqual(INTEGRATION_PAIRS, [...new Set([...COINMARKETCAP_PAIRS, ...COINGECKO_PAIRS])]);
});
