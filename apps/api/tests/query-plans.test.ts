import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { handleMarkets } from "../src/routes/markets";

/**
 * Efficiency proofs for the market browse.
 *
 * D1 bills rows READ, not rows returned, so a query that scans pair_stats is
 * a cost bug even when its results are right — and a silent one until the
 * bill arrives. These tests run the REAL route against the REAL migrations,
 * so both the SQL and the schema it depends on are covered.
 *
 * The default /markets read was measured at 12,268 rows per call to return
 * NINE, 3,450 times a day — 13.7% of the whole database's read volume.
 * Migration 0048 fixed it with a partial index, and routes/markets.ts pins
 * the planner to it with INDEXED BY because SQLite costs it above
 * idx_pair_stats_hidden even with correct statistics.
 *
 * INDEXED BY is why this file exists. It is a hard constraint, not a hint:
 * drop idx_pair_stats_browse_24h and the default market page stops being
 * slow and starts being a 500. The first test below fails loudly in CI
 * instead.
 */

const migrations = readdirSync("migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(`migrations/${name}`, "utf8"));

const NOW = 1_800_000_000;

class Statement {
  private values: unknown[] = [];
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...(this.values as never[])) as T[] };
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.values as never[])) as T | undefined) ?? null;
  }
  async run() {
    this.db.prepare(this.sql).run(...(this.values as never[]));
    return { success: true };
  }
}

/**
 * Applying the whole set to an empty database is how this file proves the
 * index migration is really there. It also exposes a drift the live database
 * never sees: 0023_pools.sql creates pool_matches.reserve_a_before, and
 * 0026_pool_match_execution_context.sql ALTERs the same column in again.
 * Production applied 0026 against the older 0023, then 0023 was edited to
 * include the column — so the set no longer replays from scratch, which
 * matters for disaster recovery and for standing up a preview D1.
 *
 * Tolerated by name here rather than ignored: any NEW replay break fails the
 * suite instead of quietly joining the exception list.
 */
const KNOWN_REPLAY_BREAKS = ["duplicate column name: reserve_a_before"];

function applyMigrations(db: DatabaseSync): string[] {
  const broke: string[] = [];
  for (const migration of migrations) {
    try {
      db.exec(migration);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!KNOWN_REPLAY_BREAKS.includes(message)) throw error;
      broke.push(message);
    }
  }
  return broke;
}

function seeded(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigrations(db);
  const add = db.prepare(
    `INSERT INTO pair_stats (pair, base_asset, quote_asset, volume_24h, trade_count_24h,
       total_volume, total_trade_count, hidden, last_price, last_trade_time)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  // Three visible pairs traded in the window, one hidden pair that also
  // traded, and a long tail that did not. The tail is what the old plan read
  // in full to find the three.
  add.run("AAA_XCP", "AAA", "XCP", 500, 5, 500, 5, 0, 1.5, NOW);
  add.run("BBB_XCP", "BBB", "XCP", 300, 3, 300, 3, 0, 2.5, NOW);
  add.run("CCC_BTC", "CCC", "BTC", 100, 1, 100, 1, 0, 3.5, NOW);
  add.run("WASH_XCP", "WASH", "XCP", 900, 9, 900, 9, 1, 9.5, NOW);
  for (let i = 0; i < 200; i++) {
    add.run(`TAIL${i}_XCP`, `TAIL${i}`, "XCP", 0, 0, i, 1, 0, null, null);
  }
  db.exec("ANALYZE");
  return db;
}

const asD1 = (db: DatabaseSync) =>
  ({ prepare: (sql: string) => new Statement(db, sql) }) as unknown as D1Database;

const markets = async (db: DatabaseSync, query = "") => {
  const response = await handleMarkets(new Request(`https://api.test/markets${query}`), asD1(db));
  assert.equal(response.status, 200, `GET /markets${query} should succeed`);
  return (await response.json()) as { total: number; markets: unknown[]; timeframe: string };
};

test("the migration set still replays, apart from the one known drift", () => {
  const db = new DatabaseSync(":memory:");
  const broke = applyMigrations(db);
  assert.deepEqual(
    broke,
    KNOWN_REPLAY_BREAKS,
    "a migration stopped replaying on an empty database. Production will not notice — it applies " +
      "each file once — but disaster recovery and preview environments will. Usually caused by " +
      "editing a migration that has already been applied.",
  );
});

test("the partial index the default browse is pinned to still exists", () => {
  const db = seeded();
  const index = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_pair_stats_browse_24h'`)
    .get() as { sql: string } | undefined;
  assert.ok(
    index,
    "idx_pair_stats_browse_24h is missing. routes/markets.ts pins the default browse to it with " +
      "INDEXED BY, so removing the index makes /markets a 500 rather than a slow query. " +
      "Remove the hint in the same change, or keep the index.",
  );
  // The predicate is load-bearing too: INDEXED BY only resolves while the
  // query's WHERE implies the index's, which is what these two terms are.
  assert.ok(
    /WHERE trade_count_24h > 0 AND hidden = 0/.test((index as { sql: string }).sql.replace(/\s+/g, " ")),
    "idx_pair_stats_browse_24h lost its predicate; the INDEXED BY hint no longer resolves",
  );
});

test("the default browse seeks the partial index instead of scanning", () => {
  const db = seeded();
  const plan = db
    .prepare(
      `EXPLAIN QUERY PLAN
       SELECT pair FROM pair_stats INDEXED BY idx_pair_stats_browse_24h
       WHERE trade_count_24h > 0 AND hidden = 0
       ORDER BY volume_24h DESC, pair ASC LIMIT 50 OFFSET 0`,
    )
    .all()
    .map((row) => (row as { detail: string }).detail);
  assert.ok(
    plan.some((line) => /idx_pair_stats_browse_24h/.test(line)),
    `default browse must use the partial index, got:\n${plan.join("\n")}`,
  );
  // No temp b-tree: the index already carries volume_24h DESC, pair ASC, so
  // the ordering is free. If this starts sorting, the index's column order
  // has drifted away from the ORDER BY.
  assert.ok(
    !plan.some((line) => /TEMP B-TREE/.test(line)),
    `default browse must not sort, got:\n${plan.join("\n")}`,
  );
});

test("every browse variant answers, including the ones the hint must not apply to", async () => {
  const db = seeded();
  // Default: 24h + visible. This is the hinted path.
  assert.equal((await markets(db)).total, 3);
  // include_hidden drops `hidden = 0`, so the query no longer implies the
  // index predicate. The hint MUST be withheld here or SQLite raises
  // "no query solution" — this asserts the guard in routes/markets.ts holds.
  assert.equal((await markets(db, "?include_hidden=1")).total, 4);
  // Other windows filter a different trade_count column; same reasoning.
  assert.equal((await markets(db, "?timeframe=30d")).timeframe, "30d");
  assert.equal((await markets(db, "?timeframe=1y")).timeframe, "1y");
  assert.ok((await markets(db, "?timeframe=all")).total > 3);
  // A quote filter still implies the index predicate, so it stays hinted.
  assert.equal((await markets(db, "?quote=XCP")).total, 2);
  assert.equal((await markets(db, "?quote=BTC")).total, 1);
  // Non-default sorts keep the hint: the index supplies the row set and
  // SQLite sorts the handful it yields.
  assert.equal((await markets(db, "?sort=trades&order=asc")).total, 3);
});

test("the browse returns only pairs that traded in the window", async () => {
  const db = seeded();
  const page = (await markets(db)) as { markets: { pair: string }[] };
  assert.deepEqual(
    page.markets.map((row) => row.pair),
    ["AAA_XCP", "BBB_XCP", "CCC_BTC"],
    "ordered by volume_24h DESC — and the 200-pair untraded tail must not appear",
  );
});
