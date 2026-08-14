import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  DEFILLAMA_DISPENSER_VOLUME_SQL,
  DEFILLAMA_TRADE_VOLUME_SQL,
} from "../src/routes/defillama";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE trades (
      pair TEXT NOT NULL, quote_asset TEXT NOT NULL, source_type TEXT NOT NULL,
      block_time INTEGER NOT NULL, volume REAL NOT NULL,
      maker TEXT NOT NULL DEFAULT 'maker', taker TEXT NOT NULL DEFAULT 'taker'
    );
    CREATE TABLE pair_stats (pair TEXT PRIMARY KEY, hidden INTEGER DEFAULT 0);
    CREATE TABLE dispenses (
      asset TEXT NOT NULL, block_time INTEGER NOT NULL, dispense_quantity REAL NOT NULL,
      btc_amount REAL NOT NULL, price REAL NOT NULL, dispenser_tx_hash TEXT NOT NULL
    );
    CREATE TABLE dispensers (tx_hash TEXT PRIMARY KEY, price REAL NOT NULL);
    CREATE TABLE dispenser_stats (asset TEXT PRIMARY KEY, hidden INTEGER DEFAULT 0);
  `);
  return db;
}

test("DefiLlama volume includes all BTC/XCP markets once and excludes unpriceable or hidden markets", () => {
  const db = fixture();
  const addTrade = db.prepare(
    `INSERT INTO trades (pair, quote_asset, source_type, block_time, volume) VALUES (?,?,?,?,?)`
  );
  db.prepare(`INSERT INTO pair_stats VALUES ('HIDDEN_XCP', 1)`).run();
  addTrade.run("LONGTAIL_XCP", "XCP", "order", 150, 12);
  // Pool normalization uses the caller/source for both maker and taker;
  // this is an AMM fill, not a bilateral self-match, and must remain included.
  db.prepare(`INSERT INTO trades (pair, quote_asset, source_type, block_time, volume, maker, taker)
              VALUES ('OTHER_BTC', 'BTC', 'pool', 160, 0.25, 'same', 'same')`).run();
  db.prepare(`INSERT INTO trades (pair, quote_asset, source_type, block_time, volume, maker, taker)
              VALUES ('SELF_XCP', 'XCP', 'order', 165, 1000, 'same', 'same')`).run();
  addTrade.run("RANDOM_OTHER", "OTHER", "order", 170, 999999);
  addTrade.run("HIDDEN_XCP", "XCP", "order", 180, 500);
  addTrade.run("AT_END_XCP", "XCP", "order", 200, 700);

  const rows = db.prepare(DEFILLAMA_TRADE_VOLUME_SQL).all(100, 200) as Array<{
    quote_asset: string; source: string; volume: number; trades: number;
  }>;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quote_asset, "BTC");
  assert.equal(rows[0].source, "pool");
  assert.equal(rows[0].volume, 0.25);
  assert.equal(rows[0].trades, 1);
  assert.equal(rows[1].quote_asset, "XCP");
  assert.equal(rows[1].source, "order");
  assert.equal(rows[1].volume, 12);
  assert.equal(rows[1].trades, 1);
  db.close();
});

test("DefiLlama dispenser volume uses protocol notional and honors hidden assets and end exclusivity", () => {
  const db = fixture();
  db.prepare(`INSERT INTO dispensers VALUES ('rate', 0.0001)`).run();
  db.prepare(`INSERT INTO dispenser_stats VALUES ('HIDDEN', 1)`).run();
  const add = db.prepare(`INSERT INTO dispenses VALUES (?,?,?,?,?,?)`);
  // Gross payment is deliberately much larger than protocol notional.
  add.run("CARD", 150, 2, 0.5, 0.25, "rate");
  add.run("HIDDEN", 160, 10, 1, 0.1, "rate");
  add.run("CARD", 200, 10, 1, 0.1, "rate");

  const row = db.prepare(DEFILLAMA_DISPENSER_VOLUME_SQL).get(100, 200) as {
    quote_asset: string; source: string; volume: number; trades: number;
  };
  assert.equal(row.quote_asset, "BTC");
  assert.equal(row.source, "dispenser");
  assert.equal(row.volume, 0.0002);
  assert.equal(row.trades, 1);
  db.close();
});
