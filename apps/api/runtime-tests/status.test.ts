import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { handleStatus } from "../src/routes/status";

it("shares counters in real D1 across origin requests and measures avoided row reads", async () => {
  const tables = ["trades", "pair_stats", "orders", "dispenses", "dispensers", "pools", "candles"];
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE analytics_response_cache(cache_key TEXT PRIMARY KEY,body TEXT NOT NULL,expires_at INTEGER NOT NULL) WITHOUT ROWID"),
    env.DB.prepare("CREATE TABLE indexer_state(key TEXT PRIMARY KEY,value TEXT)"),
    ...tables.map(t => env.DB.prepare(`CREATE TABLE ${t}(id INTEGER PRIMARY KEY,status)`)),
  ]);
  await env.DB.batch([
    ...tables.map(t => env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO ${t} SELECT x,${t === "orders" ? "'open'" : "0"} FROM n`)),
    env.DB.prepare("INSERT INTO indexer_state VALUES('indexer_mode','FOLLOWING'),('last_run_time',?),('last_block_index','100')")
      .bind(String(Math.floor(Date.now() / 1000))),
  ]);

  const scans = tables.map(t => env.DB.prepare(`SELECT COUNT(*) as cnt FROM ${t}${t === "orders" ? " WHERE status = 'open'" : t === "dispensers" ? " WHERE status < 10" : ""}`));
  const baseline = await env.DB.batch(scans);
  const beforeRows = baseline.reduce((n, r) => n + r.meta.rows_read, 0);
  let rowsRead = 0;
  let countScans = 0;
  const instrumented = {
    prepare(sql: string) {
      let statement = env.DB.prepare(sql);
      return {
        bind(...values: unknown[]) { statement = statement.bind(...values); return this; },
        async first() { const result = await statement.all(); rowsRead += result.meta.rows_read; return result.results[0] ?? null; },
        async all() {
          const result = await statement.all(); rowsRead += result.meta.rows_read;
          if (sql.startsWith("SELECT COUNT")) countScans++;
          return result;
        },
        async run() { const result = await statement.run(); rowsRead += result.meta.rows_read; return result; },
      };
    },
    batch(statements: { all(): Promise<unknown> }[]) { return Promise.all(statements.map(s => s.all())); },
  } as unknown as D1Database;
  const first = await handleStatus(instrumented);
  const coldRows = rowsRead;
  expect(first.headers.get("x-status-counts-cache")).toBe("MISS");
  await first.arrayBuffer();
  rowsRead = 0;
  const second = await handleStatus(instrumented);
  const warmRows = rowsRead;
  expect(second.headers.get("x-status-counts-cache")).toBe("HIT");
  expect((await second.json() as { dispenses: number }).dispenses).toBe(1000);
  expect(countScans).toBe(7);
  expect(beforeRows).toBe(7000);
  expect(warmRows).toBe(4);
  console.info(JSON.stringify({ measurement: "status-d1-row-reads", baselineCounterRows: beforeRows, coldRows, warmRows }));

  // Actual Worker route, including middleware, retains the response shape.
  const response = await exports.default.fetch("https://api.xcpdex.com/status?runtime-fixture=1");
  expect(response.status).toBe(200);
  expect(response.headers.get("x-status-counts-cache")).toBe("HIT");
  const body = await response.json<{ ok: boolean; candles: number; indexer: { last_block_index: string } }>();
  expect(body.ok).toBe(true);
  expect(body.candles).toBe(1000);
  expect(body.indexer.last_block_index).toBe("100");
});
