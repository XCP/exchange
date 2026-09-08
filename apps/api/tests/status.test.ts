import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { handleStatus } from "../src/routes/status";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0050_analytics_response_cache.sql", "utf8"));
  for (const table of ["trades", "pair_stats", "orders", "dispenses", "dispensers", "pools", "candles"]) {
    sqlite.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,status); INSERT INTO ${table} VALUES(1,'open'),(2,0),(3,10)`);
  }
  sqlite.exec("CREATE TABLE indexer_state(key TEXT PRIMARY KEY,value TEXT); INSERT INTO indexer_state VALUES('indexer_mode','FOLLOWING'),('last_run_time','990'),('last_block_index','100'),('aggregation_offset','999')");
  const usage = { countQueries: 0, stateQueries: 0, cacheReads: 0, cacheWrites: 0 };
  const failure = { cacheRead: false, cacheWrite: false, count: false, state: false };
  let beforeCounts = () => {};
  const db = {
    withSession(mode: string) { assert.equal(mode, "first-primary"); return this; },
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async first() {
          usage.cacheReads++;
          if (failure.cacheRead) throw new Error("cache unavailable");
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          if (sql.startsWith("SELECT COUNT")) {
            usage.countQueries++;
            beforeCounts();
            if (failure.count) throw new Error("counts unavailable");
          } else {
            usage.stateQueries++;
            if (failure.state) throw new Error("state unavailable");
          }
          return { results: sqlite.prepare(sql).all(...values), success: true, meta: {} };
        },
        async run() {
          usage.cacheWrites++;
          if (failure.cacheWrite) throw new Error("cache unavailable");
          return sqlite.prepare(sql).run(...values);
        },
      };
    },
    async batch(statements: { all(): Promise<unknown> }[]) { return Promise.all(statements.map(s => s.all())); },
  } as unknown as D1Database;
  return { db, sqlite, usage, failure, beforeCounts(fn: () => void) { beforeCounts = fn; } };
}

test("ten origin requests retain exact counters with seven scans instead of seventy", async () => {
  const h = fixture();
  for (let i = 0; i < 10; i++) {
    const response = await handleStatus(h.db, () => 1000 + i);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual({ trades: body.trades, pairs: body.pairs, orders: body.open_orders,
      dispenses: body.dispenses, dispensers: body.open_dispensers, pools: body.pools, candles: body.candles },
    { trades: 3, pairs: 3, orders: 1, dispenses: 3, dispensers: 1, pools: 3, candles: 3 });
    assert.equal(body.ok, true);
    assert.equal(body.indexer_age_seconds, 10 + i);
    assert.equal(response.headers.get("x-status-counts-cache"), i ? "HIT" : "MISS");
    assert.equal(response.headers.get("cache-control"), `public, max-age=${300 - i}`);
  }
  assert.deepEqual(h.usage, { countQueries: 7, stateQueries: 10, cacheReads: 10, cacheWrites: 1 });
  h.sqlite.close();
});

test("cached counters do not cache indexer state or extend counter freshness", async () => {
  const h = fixture();
  await handleStatus(h.db, () => 1000);
  h.sqlite.exec("INSERT INTO trades VALUES(4,'open'); UPDATE indexer_state SET value='101' WHERE key='last_block_index'; UPDATE indexer_state SET value='IDLE' WHERE key='indexer_mode'");
  const warm = await handleStatus(h.db, () => 1299);
  const body = await warm.json() as { ok: boolean; trades: number; mode: string; indexer: Record<string, string> };
  assert.equal(body.trades, 3);
  assert.equal(body.ok, false);
  assert.equal(body.mode, "IDLE");
  assert.equal(body.indexer.last_block_index, "101");
  assert.equal(body.indexer.aggregation_offset, undefined);
  assert.equal(warm.headers.get("cache-control"), "public, max-age=1");
  const expired = await handleStatus(h.db, () => 1300);
  assert.equal((await expired.json() as { trades: number }).trades, 4);
  assert.equal(expired.headers.get("x-status-counts-cache"), "MISS");
  assert.equal(h.usage.countQueries, 14);
  h.sqlite.close();
});

test("health retains missing, stale and future heartbeat behavior", async () => {
  const h = fixture();
  for (const [value, age, healthy] of [["", null, false], ["not-a-time", null, false], ["100", 900, true], ["99", 901, false], ["1001", 0, true]] as const) {
    h.sqlite.prepare("UPDATE indexer_state SET value=? WHERE key='last_run_time'").run(value);
    const body = await (await handleStatus(h.db, () => 1000)).json() as { indexer_age_seconds: number | null; ok: boolean };
    assert.equal(body.indexer_age_seconds, age);
    assert.equal(body.ok, healthy);
  }
  h.sqlite.exec("DELETE FROM indexer_state");
  const empty = await (await handleStatus(h.db, () => 1000)).json() as { mode: string; ok: boolean };
  assert.equal(empty.mode, "IDLE");
  assert.equal(empty.ok, false);
  h.sqlite.close();
});

test("corrupt or structurally invalid counters are recomputed", async () => {
  const h = fixture();
  for (const body of ["not-json", "null", "{}", '{"trades":-1}', '{"trades":"3"}']) {
    h.sqlite.prepare("INSERT OR REPLACE INTO analytics_response_cache VALUES('status/counts/v1',?,1300)").run(body);
    const response = await handleStatus(h.db, () => 1000);
    assert.equal(response.headers.get("x-status-counts-cache"), "MISS");
    assert.equal((await response.json() as { trades: number }).trades, 3);
  }
  h.sqlite.close();
});

test("cache read/write failure preserves availability; query errors are not converted to healthy status", async () => {
  const h = fixture();
  h.failure.cacheRead = true;
  h.failure.cacheWrite = true;
  assert.equal((await handleStatus(h.db, () => 1000)).status, 200);
  h.failure.count = true;
  let rejected = false;
  try { await handleStatus(h.db, () => 1000); } catch { rejected = true; }
  assert.ok(rejected);
  h.failure.count = false;
  h.failure.state = true;
  rejected = false;
  try { await handleStatus(h.db, () => 1000); } catch { rejected = true; }
  assert.ok(rejected);
  h.sqlite.close();
});

test("unexpected cached fields cannot override live health or indexer state", async () => {
  const h = fixture();
  await handleStatus(h.db, () => 1000);
  const stored = JSON.parse((h.sqlite.prepare("SELECT body FROM analytics_response_cache").get() as { body: string }).body);
  h.sqlite.prepare("UPDATE analytics_response_cache SET body=?").run(JSON.stringify({ ...stored, ok: false, mode: "IDLE", indexer: {} }));
  const body = await (await handleStatus(h.db, () => 1001)).json() as { ok: boolean; mode: string; indexer: { last_block_index: string } };
  assert.equal(body.ok, true);
  assert.equal(body.mode, "FOLLOWING");
  assert.equal(body.indexer.last_block_index, "100");
  h.sqlite.close();
});

test("slow counter scans consume freshness rather than granting extra TTL", async () => {
  const h = fixture();
  let now = 1000;
  h.beforeCounts(() => { now = 1006; });
  const response = await handleStatus(h.db, () => now);
  assert.equal(response.headers.get("cache-control"), "public, max-age=294");
  assert.equal((h.sqlite.prepare("SELECT expires_at FROM analytics_response_cache").get() as { expires_at: number }).expires_at, 1300);
  h.sqlite.close();
});
