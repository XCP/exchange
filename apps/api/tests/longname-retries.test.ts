import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { backfillMissingLongnames } from "../src/indexer/stats";

const NOW = 1_800_000_000;

function fixture(assets: string[]) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE pair_stats(pair TEXT PRIMARY KEY, base_asset TEXT, base_asset_longname TEXT);
    CREATE TABLE assets(asset TEXT PRIMARY KEY, asset_longname TEXT, updated_at INTEGER);`);
  sqlite.exec(readFileSync("migrations/0049_asset_longname_checks.sql", "utf8"));
  for (const asset of assets) sqlite.prepare("INSERT INTO pair_stats VALUES(?, ?, NULL)").run(`${asset}_XCP`, asset);
  const prepare = (sql: string) => {
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) { values = args; return this; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return sqlite.prepare(sql).run(...values); },
    };
  };
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
  return { db, sqlite };
}

function source(reply: (asset: string) => Response | Promise<Response>) {
  const called: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const asset = String(input).split("/").at(-1)!;
    called.push(asset);
    return reply(asset);
  };
  return { called, fetcher };
}

test("authoritative nulls leave the next batch reachable and replay makes no requests or writes", async () => {
  const h = fixture(["A100", "A101", "A102", "APPLE", "A123XYZ"]);
  const s = source((asset) => Response.json({ result: { asset, asset_longname: null } }));
  await backfillMissingLongnames(h.db, 2, { now: NOW, fetcher: s.fetcher });
  await backfillMissingLongnames(h.db, 2, { now: NOW + 120, fetcher: s.fetcher });
  assert.deepEqual(s.called, ["A100", "A101", "A102"]);
  const changes = h.sqlite.prepare("SELECT total_changes() AS n").get();
  await backfillMissingLongnames(h.db, 2, { now: NOW + 240, fetcher: s.fetcher });
  assert.deepEqual(s.called, ["A100", "A101", "A102"]);
  assert.deepEqual(h.sqlite.prepare("SELECT total_changes() AS n").get(), changes);
  await backfillMissingLongnames(h.db, 2, { now: NOW + 7 * 86400, fetcher: s.fetcher });
  assert.deepEqual(s.called.slice(3), ["A100", "A101"]);
  h.sqlite.close();
});

test("newly appearing assets are resolved during existing negative cooldowns", async () => {
  const h = fixture(["A100"]);
  const s = source((asset) => Response.json({ result: { asset, asset_longname: asset === "A200" ? "PARENT.CHILD" : null } }));
  await backfillMissingLongnames(h.db, 10, { now: NOW, fetcher: s.fetcher });
  h.sqlite.prepare("INSERT INTO pair_stats VALUES(?, ?, NULL)").run("A200_XCP", "A200");
  assert.equal(await backfillMissingLongnames(h.db, 10, { now: NOW + 120, fetcher: s.fetcher }), 1);
  assert.deepEqual(s.called, ["A100", "A200"]);
  assert.equal((h.sqlite.prepare("SELECT base_asset_longname AS name FROM pair_stats WHERE base_asset='A200'").get() as { name: string }).name, "PARENT.CHILD");
  h.sqlite.close();
});

test("provider failures rotate behind unseen assets and retry at the usual two-minute cadence", async () => {
  const h = fixture(["A100", "A101"]);
  let available = false;
  const s = source((asset) => available
    ? Response.json({ result: { asset, asset_longname: "PARENT.RECOVERED" } })
    : new Response(null, { status: 503 }));
  await backfillMissingLongnames(h.db, 1, { now: NOW, fetcher: s.fetcher });
  await backfillMissingLongnames(h.db, 1, { now: NOW + 120, fetcher: s.fetcher });
  assert.deepEqual(s.called, ["A100", "A101"]);
  available = true;
  assert.equal(await backfillMissingLongnames(h.db, 1, { now: NOW + 121, fetcher: s.fetcher }), 1);
  assert.deepEqual(s.called, ["A100", "A101", "A100"]);
  assert.equal((h.sqlite.prepare("SELECT COUNT(*) AS n FROM asset_longname_checks WHERE asset='A100'").get() as { n: number }).n, 0);
  h.sqlite.close();
});

test("malformed and mismatched successful responses are not cached as authoritative nulls", async () => {
  const h = fixture(["A100", "A101", "A102"]);
  const s = source((asset) => Response.json(asset === "A100"
    ? { result: { asset } }
    : asset === "A101" ? { result: { asset: "WRONG", asset_longname: null } } : { result: null }));
  await backfillMissingLongnames(h.db, 10, { now: NOW, fetcher: s.fetcher });
  const checks = h.sqlite.prepare("SELECT outcome, retry_after FROM asset_longname_checks").all() as { outcome: string; retry_after: number }[];
  assert.equal(checks.length, 3);
  for (const check of checks) {
    assert.equal(check.outcome, "unavailable");
    assert.equal(check.retry_after, NOW + 120);
  }
  h.sqlite.close();
});
