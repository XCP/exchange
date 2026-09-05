import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { analyticsCacheKey, cachedAnalytics } from "../src/lib/analytics-cache";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0050_analytics_response_cache.sql", "utf8"));
  const failures = { read: false, write: false };
  const counts = { reads: 0, writes: 0 };
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async first() { counts.reads++; if (failures.read) throw new Error("read unavailable"); return sqlite.prepare(sql).get(...values) ?? null; },
        async run() { counts.writes++; if (failures.write) throw new Error("write unavailable"); return sqlite.prepare(sql).run(...values); },
      };
    },
  } as unknown as D1Database;
  return { db, sqlite, failures, counts };
}
const request = (query = "", host = "api.xcpdex.com") => new Request(`https://${host}/analytics${query}`);

test("canonical keys collapse aliases/defaults/order while retaining economic selectors", () => {
  const baseline = analyticsCacheKey(request("?timeframe=all&section=summary"));
  assert.equal(analyticsCacheKey(request("?section=summary&quote_asset=XCP&timeframe=all&unused=x", "xcpdex-api.me-bbe.workers.dev")), baseline);
  assert.notEqual(analyticsCacheKey(request("?timeframe=all&section=summary&include_hidden=1")), baseline);
  assert.notEqual(analyticsCacheKey(request("?timeframe=all&section=traders")), baseline);
  assert.notEqual(analyticsCacheKey(request("?timeframe=all&section=summary&quote_asset=BTC")), baseline);
  assert.equal(analyticsCacheKey(request("?timeframe=garbage")), analyticsCacheKey(request()));
  assert.equal(analyticsCacheKey(request("?section=charts&quote_asset=BTC")), analyticsCacheKey(request("?section=charts")));
  assert.notEqual(analyticsCacheKey(request()), analyticsCacheKey(request("?section=summary")));
});

test("unbounded or unrelated routes and methods never touch the shared cache", async () => {
  const h = fixture();
  let produced = 0;
  for (const input of [
    request("?tag=rarepepe"), request("?quote_asset=OTHER"), request("?section=all"), request("?section="),
    new Request("https://api.xcpdex.com/swaps/1"), new Request("https://api.xcpdex.com/analytics", { method: "POST" }),
  ]) {
    assert.equal(analyticsCacheKey(input), null);
    await cachedAnalytics(input, h.db, async () => { produced++; return Response.json({ public: false }); });
  }
  assert.equal(produced, 6);
  assert.deepEqual(h.counts, { reads: 0, writes: 0 });
  h.sqlite.close();
});

test("shared hits preserve exact JSON and only remaining freshness; expiry recomputes", async () => {
  const h = fixture();
  let time = 1000;
  let produced = 0;
  const producer = async () => { produced++; return Response.json({ value: 1.23456789, nullValue: null, rows: [] }); };
  const first = await cachedAnalytics(request(), h.db, producer, () => time);
  assert.equal(first.headers.get("x-analytics-cache"), "MISS");
  time = 4590;
  const second = await cachedAnalytics(request("?quote_asset=XCP"), h.db, producer, () => time);
  assert.equal(second.headers.get("x-analytics-cache"), "HIT");
  assert.equal(second.headers.get("cache-control"), "public, max-age=10");
  assert.equal(await second.text(), await first.text());
  assert.equal(produced, 1);
  time = 4600;
  const third = await cachedAnalytics(request(), h.db, producer, () => time);
  assert.equal(third.headers.get("x-analytics-cache"), "MISS");
  assert.equal(produced, 2);
  h.sqlite.close();
});

test("simultaneous canonical cold reads in one isolate share a producer and readable responses", async () => {
  const h = fixture();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let produced = 0;
  const producer = async () => { produced++; await gate; return Response.json({ value: "same" }); };
  const first = cachedAnalytics(request(), h.db, producer, () => 1000);
  const second = cachedAnalytics(request("?quote_asset=XCP"), h.db, producer, () => 1000);
  release!();
  const responses = await Promise.all([first, second]);
  assert.equal(await responses[0].text(), await responses[1].text());
  assert.equal(produced, 1);
  assert.deepEqual(h.counts, { reads: 1, writes: 1 });
  h.sqlite.close();
});

test("errors are not persisted and cache storage failure keeps public responses available", async () => {
  const h = fixture();
  const failed = await cachedAnalytics(request(), h.db, async () => new Response("upstream error", { status: 502 }), () => 1000);
  assert.equal(failed.status, 502);
  assert.equal(h.counts.writes, 0);
  h.failures.read = true; h.failures.write = true;
  const response = await cachedAnalytics(request(), h.db, async () => Response.json({ ok: true }), () => 1000);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"ok":true}');
  h.sqlite.close();
});

test("independent cold isolates may duplicate once without locking or serving expired data", async () => {
  const h = fixture();
  // Another binding identity models an independent isolate with the same D1.
  const otherDb = { prepare: h.db.prepare.bind(h.db) } as D1Database;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let produced = 0;
  const producer = async () => { produced++; await gate; return Response.json({ value: "fresh" }); };
  const first = cachedAnalytics(request(), h.db, producer, () => 1000);
  const second = cachedAnalytics(request(), otherDb, producer, () => 1000);
  release!();
  const responses = await Promise.all([first, second]);
  assert.equal(produced, 2);
  assert.equal(await responses[0].text(), await responses[1].text());
  assert.equal((h.sqlite.prepare("SELECT COUNT(*) AS n FROM analytics_response_cache").get() as { n: number }).n, 1);
  const warm = await cachedAnalytics(request(), otherDb, producer, () => 1001);
  assert.equal(warm.headers.get("x-analytics-cache"), "HIT");
  assert.equal(produced, 2);
  h.sqlite.close();
});

test("a rejected producer releases single-flight state and slow production cannot extend freshness", async () => {
  const h = fixture();
  let caught = false;
  try {
    await cachedAnalytics(request(), h.db, async () => { throw new Error("query failed"); }, () => 1000);
  } catch { caught = true; }
  assert.ok(caught);
  assert.equal(h.counts.writes, 0);
  let time = 1000;
  const recovered = await cachedAnalytics(request(), h.db, async () => {
    time = 1005;
    return Response.json({ recovered: true });
  }, () => time);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("cache-control"), "public, max-age=3595");
  assert.equal((h.sqlite.prepare("SELECT expires_at FROM analytics_response_cache").get() as { expires_at: number }).expires_at, 4600);
  h.sqlite.close();
});
