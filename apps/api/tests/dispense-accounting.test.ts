import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { repriceDispensesSQL } from "../src/lib/dispense-accounting";
import { DEFILLAMA_DISPENSER_VOLUME_SQL } from "../src/routes/defillama";
import { DISPENSE_AGG_SQL } from "../src/lib/market-summary";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE dispenses (
    id INTEGER PRIMARY KEY, tx_hash TEXT, dispense_index INTEGER,
    source TEXT, destination TEXT, asset TEXT, block_time INTEGER, block_index INTEGER,
    dispense_quantity REAL, btc_amount REAL, price REAL, dispenser_tx_hash TEXT,
    quote_volume REAL DEFAULT 0, execution_price REAL DEFAULT 0, payment_asset_count INTEGER DEFAULT 1,
    UNIQUE(tx_hash, dispense_index));
    CREATE INDEX idx_dispenses_block ON dispenses(block_index);
    CREATE TABLE dispensers(tx_hash TEXT PRIMARY KEY, price REAL);
    CREATE TABLE dispenser_stats(asset TEXT PRIMARY KEY, hidden INTEGER DEFAULT 0);`);
  const add = (tx: string, index: number, asset: string, payment: number, notional: number | null,
    seller = "seller", quantity = 1, block = 1) => {
    const dispenser = `${seller}/${asset}`;
    if (notional !== null) db.prepare("INSERT OR REPLACE INTO dispensers VALUES (?, ?)").run(dispenser, notional / quantity);
    db.prepare(`INSERT INTO dispenses(tx_hash,dispense_index,source,destination,asset,
      block_time,block_index,dispense_quantity,btc_amount,price,dispenser_tx_hash)
      VALUES (?, ?, ?, 'buyer', ?, 150, ?, ?, ?, ?, ?)`)
      .run(tx, index, seller, asset, block, quantity, payment, payment / quantity, dispenser);
  };
  const total = (tx: string) => Number((db.prepare("SELECT SUM(quote_volume) AS n FROM dispenses WHERE tx_hash = ?").get(tx) as { n: number }).n.toFixed(12));
  return { db, add, total };
}

test("September 16 Pokemon bundle: 151 assets share 0.02 BTC, not 3.02 BTC", () => {
  const { db, add, total } = fixture();
  const tx = "70808e2a477cef90363e94263dba8f51cb6d6f3d70e51cb5a7acd8037e681132";
  for (let i = 0; i < 151; i++) add(tx, i, `POKEMON${String(i).padStart(3, "0")}`, 0.02, 0.02);
  db.exec(repriceDispensesSQL());
  assert.equal(total(tx), 0.02);
  const rows = db.prepare("SELECT quote_volume,execution_price,btc_amount,payment_asset_count FROM dispenses").all() as Array<Record<string, number>>;
  for (const row of rows) {
    assert.ok(Math.abs(row.quote_volume - 0.02 / 151) < 1e-12);
    assert.equal(row.execution_price, row.quote_volume);
    assert.equal(row.btc_amount, 0.02, "raw payment remains auditable");
    assert.equal(row.payment_asset_count, 151);
  }
  const feed = db.prepare(DEFILLAMA_DISPENSER_VOLUME_SQL).get(100, 200) as { volume: number };
  assert.ok(Math.abs(feed.volume - 0.02) < 1e-12);
  // Hidden assets still consume their allocated share. Filtering a market may
  // not give the visible asset all the BTC again.
  db.prepare("INSERT INTO dispenser_stats VALUES ('POKEMON000', 1)").run();
  const hidden = db.prepare(DEFILLAMA_DISPENSER_VOLUME_SQL).get(100, 200) as { volume: number };
  assert.ok(Math.abs(hidden.volume - 0.02 * 150 / 151) < 1e-12);
  const market = db.prepare(DISPENSE_AGG_SQL("?")).get("POKEMON001", 0) as { qv: number; high: number };
  assert.ok(Math.abs(market.qv - 0.02 / 151) < 1e-12);
  assert.equal(market.high, market.qv);
  db.close();
});

test("allocation is proportional, excludes overpayment, and caps missing-metadata fallback", () => {
  const { db, add, total } = fixture();
  add("weighted", 0, "A", 0.02, 0.02);
  add("weighted", 1, "B", 0.02, 0.01);
  add("overpaid", 0, "C", 0.5, 0.001, "solo", 10);
  add("missing", 0, "D", 0.02, null);
  add("missing", 1, "E", 0.02, null);
  db.exec(repriceDispensesSQL());
  assert.equal(total("weighted"), 0.02);
  const weighted = db.prepare("SELECT quote_volume FROM dispenses WHERE tx_hash='weighted' ORDER BY dispense_index").all() as Array<{quote_volume: number}>;
  assert.equal(weighted[0].quote_volume, 2 * weighted[1].quote_volume);
  assert.equal(total("overpaid"), 0.001);
  assert.equal(total("missing"), 0.02);
  db.close();
});

test("multiple outputs, identical payments, different sellers and depleted assets stay separate", () => {
  const { db, add, total } = fixture();
  add("multi", 0, "A", 0.02, 0.02);
  add("multi", 1, "B", 0.02, 0.02);
  add("multi", 2, "A", 0.02, 0.02); // repeated same-seller output
  add("multi", 3, "B", 0.02, 0.02);
  add("multi", 4, "B", 0.02, 0.02); // A depleted: asset order restarts at B
  add("multi", 5, "C", 0.03, 0.03); // new amount, ascending asset
  add("multi", 6, "D", 0.03, 0.03, "other seller");
  add("multi", 7, "E", 0.03, 0.03, "other seller");
  db.exec(repriceDispensesSQL());
  assert.equal(total("multi"), 0.12);
  db.close();
});

test("block-scoped retries are idempotent and late backfill rows reallocate the whole transaction", () => {
  const { db, add, total } = fixture();
  add("page", 1, "B", 0.02, 0.02);
  add("unrelated", 0, "X", 0.03, 0.03, "seller", 1, 2);
  const sql = repriceDispensesSQL("d.block_index = ?");
  db.prepare(sql).run(1);
  assert.equal(total("page"), 0.02);
  assert.equal(total("unrelated"), 0);
  add("page", 0, "A", 0.02, 0.02);
  db.prepare(sql).run(1);
  db.prepare(sql).run(1);
  assert.equal(total("page"), 0.02);
  assert.equal((db.prepare("SELECT quote_volume FROM dispenses WHERE tx_hash='page' AND dispense_index=1").get() as {quote_volume: number}).quote_volume, 0.01);
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1) as Array<{ detail: string }>;
  assert.ok(plan.some(row => row.detail.includes("idx_dispenses_block")), "only the changed block is read");
  db.close();
});

test("historical migration uses exactly the live ingestion allocation query", () => {
  const migration = readFileSync("migrations/0052_dispense_payment_accounting.sql", "utf8").replace(/\r\n/g, "\n");
  assert.ok(migration.includes(repriceDispensesSQL() + ";"));
});
