import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { checkpointStatements, findCommonCheckpoint } from "../src/indexer/block-checkpoint";
import { addLpDelta, addBalanceSnapshots, allocatePoolFees, loadAppliedPoolBalances, type PendingPoolBalances } from "../src/indexer/pool-accounting";
import { syncBlocks } from "../src/indexer/sync-block";

function same(actual: unknown, expected: unknown) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").filter(file => file.endsWith(".sql")).sort()) {
    try { sqlite.exec(readFileSync(`migrations/${file}`, "utf8")); }
    catch (error) {
      // Pre-existing migration replay drift, also pinned in query-plans.test.
      if (!(error instanceof Error) || error.message !== "duplicate column name: reserve_a_before") throw error;
    }
  }
  let fail: (sql: string) => boolean = () => false;
  class Statement {
    values: unknown[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) { this.values = values; return this; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async run() {
      if (fail(this.sql)) throw new Error("Injected write failure");
      const result = sqlite.prepare(this.sql).run(...this.values);
      return { success: true, meta: { changes: Number(result.changes) }, results: [] };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT"); return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, db, fail: (f: typeof fail) => { fail = f; } };
}

async function rejects(run: () => Promise<unknown>, text: string) {
  let caught = false;
  try { await run(); } catch (error) { caught = true; assert.ok(String(error).includes(text), String(error)); }
  assert.ok(caught, `Expected failure: ${text}`);
}

const block = (height: number, branch = "a") => ({ block_index: height, block_hash: branch.repeat(62) + String(height).padStart(2, "0"), block_time: 1_800_000_000 + height });
function seed(h: ReturnType<typeof fixture>, holder: string, amount: number) {
  h.sqlite.prepare(`INSERT INTO pool_lp_balances(lp_asset,pair,address,holder,holder_type,balance_raw,balance)
    VALUES ('LP','AAA_XCP',?,?,'address',?,?)`).run(holder, holder, amount, amount);
}
function delta(stmts: ((db: D1Database) => D1PreparedStatement)[], pending: PendingPoolBalances, event: number, holder: string, amount: number) {
  addLpDelta(stmts, pending, { event: amount > 0 ? "CREDIT" : "DEBIT", txHash: `tx${event}`, eventIndex: event,
    txIndex: event, blockIndex: 2, blockTime: block(2).block_time, lpAsset: "LP", pair: "AAA_XCP",
    address: holder, holder, holderType: "address", ownerAddress: holder, deltaRaw: amount, delta: amount, reason: "test" });
}

test("checkpoint height/hash/time and retained history commit together; unchanged retry writes nothing", async () => {
  const h = fixture();
  await h.db.batch(checkpointStatements(h.db, block(1)));
  h.fail(sql => sql.includes("INSERT INTO indexer_block_checkpoints"));
  await rejects(() => h.db.batch(checkpointStatements(h.db, block(2))), "Injected");
  same(h.sqlite.prepare("SELECT key,value FROM indexer_state WHERE key LIKE 'last_block_%' ORDER BY key").all(), [
    { key: "last_block_hash", value: block(1).block_hash }, { key: "last_block_index", value: "1" }, { key: "last_block_time", value: String(block(1).block_time) },
  ]);
  h.fail(() => false);
  const before = h.sqlite.prepare("SELECT total_changes() n").get();
  await h.db.batch(checkpointStatements(h.db, block(1)));
  same(h.sqlite.prepare("SELECT total_changes() n").get(), before);
  h.sqlite.close();
});

test("common ancestor must match retained hashes; missing history fails closed", async () => {
  const h = fixture();
  for (let height = 1; height <= 4; height++) await h.db.batch(checkpointStatements(h.db, block(height)));
  same(await findCommonCheckpoint(h.db, 3, async height => block(height, height > 1 ? "b" : "a").block_hash), block(1));
  await rejects(() => findCommonCheckpoint(h.db, 3, async height => block(height, "b").block_hash), "No verified");
  h.sqlite.close();
});

test("duplicate LP events do not double-apply and event/balance failure is atomic", async () => {
  const h = fixture(); seed(h, "alice", 100);
  const stmts: ((db: D1Database) => D1PreparedStatement)[] = [];
  delta(stmts, new Map(), 1, "alice", 20);
  await h.db.batch(stmts.map(fn => fn(h.db))); await h.db.batch(stmts.map(fn => fn(h.db)));
  same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 120 });
  const bad: typeof stmts = []; delta(bad, new Map(), 2, "alice", -121);
  await rejects(() => h.db.batch(bad.map(fn => fn(h.db))), "underflow");
  same(h.sqlite.prepare("SELECT COUNT(*) n FROM pool_lp_balance_events").get(), { n: 1 });
  same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 120 });
  h.sqlite.close();
});

test("partial-block retry preserves snapshots and fee allocation, including a holder already debited to zero", async () => {
  const h = fixture(); seed(h, "alice", 100); seed(h, "bob", 100);
  const partial: ((db: D1Database) => D1PreparedStatement)[] = [];
  delta(partial, new Map(), 2, "alice", -100);
  await h.db.batch(partial.map(fn => fn(h.db)));
  const applied = await loadAppliedPoolBalances(h.db, 2);
  const stmts: typeof partial = []; const pending: PendingPoolBalances = new Map();
  // Fee event precedes the already-written debit in the canonical ordering.
  await allocatePoolFees(h.db, stmts, pending, { txHash: "fee", orderTxHash: null, eventIndex: 1,
    blockIndex: 2, blockTime: block(2).block_time, lpAsset: "LP", pair: "AAA_XCP",
    feeAsset: "XCP", feeQuantityRaw: 100, feeQuantity: 100 }, applied);
  delta(stmts, pending, 2, "alice", -100); delta(stmts, pending, 3, "bob", 100);
  await addBalanceSnapshots(h.db, stmts, pending, 2, block(2).block_time, applied);
  await h.db.batch(stmts.map(fn => fn(h.db)));
  same(h.sqlite.prepare("SELECT holder,balance_raw FROM pool_lp_balances ORDER BY holder").all(), [{ holder: "alice", balance_raw: 0 }, { holder: "bob", balance_raw: 200 }]);
  same(h.sqlite.prepare("SELECT holder,balance_raw FROM pool_lp_balance_snapshots ORDER BY holder").all(), [{ holder: "alice", balance_raw: 0 }, { holder: "bob", balance_raw: 200 }]);
  same(h.sqlite.prepare("SELECT holder,fee_quantity_raw FROM pool_fee_accruals ORDER BY holder").all(), [{ holder: "alice", fee_quantity_raw: 50 }, { holder: "bob", fee_quantity_raw: 50 }]);
  h.sqlite.close();
});

test("rollback reverses only orphan deltas and preserves a baseline absent from history", async () => {
  const h = fixture(); seed(h, "alice", 100);
  const stmts: ((db: D1Database) => D1PreparedStatement)[] = [];
  const pending: PendingPoolBalances = new Map(); delta(stmts, pending, 1, "alice", 20); delta(stmts, pending, 2, "alice", -80);
  await h.db.batch(stmts.map(fn => fn(h.db)));
  await h.db.prepare("DELETE FROM pool_lp_balance_events WHERE block_index > 1").run();
  await h.db.prepare("DELETE FROM pool_lp_balance_events WHERE block_index > 1").run();
  same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 100 });
  h.sqlite.close();
});

test("retry lookup uses the block index, not all LP history", () => {
  const h = fixture();
  const plan = h.sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM pool_lp_balance_events WHERE block_index = ?").all(2);
  assert.ok(JSON.stringify(plan).includes("idx_pool_lp_events_block")); h.sqlite.close();
});

test("real sync survives a later block failure without producing a stale checkpoint hash", async () => {
  const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  const original = globalThis.fetch; let failThird = true;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/last")) return Response.json({ result: block(3) });
    const height = Number(url.pathname.split("/")[2]);
    if (url.pathname.endsWith("/events")) {
      if (height === 3 && failThird) return new Response(null, { status: 503 });
      return Response.json({ result: [], next_cursor: null });
    }
    return Response.json({ result: block(height) });
  };
  try {
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "503");
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_hash'").get(), { value: block(2).block_hash });
    failThird = false;
    assert.equal((await syncBlocks(h.db, "https://core.test", 10)).last_block, 3);
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("real sync resumes an interrupted rollback after ledger deletion without losing its affected set or opening balance", async () => {
  const h = fixture(); seed(h, "alice", 100);
  const stmts: ((db: D1Database) => D1PreparedStatement)[] = [];
  delta(stmts, new Map(), 1, "alice", 20); await h.db.batch(stmts.map(fn => fn(h.db)));
  await h.db.batch(checkpointStatements(h.db, block(1))); await h.db.batch(checkpointStatements(h.db, block(2)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: block(2, "b") });
    if (path.endsWith("/events")) return Response.json({ result: [], next_cursor: null });
    const height = Number(path.split("/")[2]); return Response.json({ result: block(height, height > 1 ? "b" : "a") });
  };
  try {
    h.fail(sql => sql.includes("DELETE FROM pool_address_fee_totals"));
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "Injected");
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 100 });
    assert.ok(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='rollback_plan'").get());
    h.fail(() => false);
    assert.equal((await syncBlocks(h.db, "https://core.test", 10)).last_block, 2);
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 100 });
    assert.equal(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='rollback_plan'").get(), undefined);
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_hash'").get(), { value: block(2, "b").block_hash });
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("real sync rejects a block changing while its events are fetched before writing anything", async () => {
  const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  const original = globalThis.fetch; let requestedEvents = false;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: block(2) });
    if (path.endsWith("/events")) { requestedEvents = true; return Response.json({ result: [], next_cursor: null }); }
    const height = Number(path.split("/")[2]);
    return Response.json({ result: block(height, height === 2 && requestedEvents ? "b" : "a") });
  };
  try {
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "changed while fetching");
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "1" });
    assert.equal(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='pending_block'").get(), undefined);
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("a pending block on an orphan branch is reversed before replacement events replay", async () => {
  const h = fixture(); seed(h, "alice", 100);
  await h.db.batch(checkpointStatements(h.db, block(1)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  h.sqlite.prepare("INSERT INTO indexer_state VALUES('pending_block',?)").run(JSON.stringify(block(2)));
  const stmts: ((db: D1Database) => D1PreparedStatement)[] = [];
  delta(stmts, new Map(), 1, "alice", 20); await h.db.batch(stmts.map(fn => fn(h.db)));
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: block(2, "b") });
    if (path.endsWith("/events")) return Response.json({ result: [], next_cursor: null });
    const height = Number(path.split("/")[2]); return Response.json({ result: block(height, height > 1 ? "b" : "a") });
  };
  try {
    await syncBlocks(h.db, "https://core.test", 10);
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 100 });
    assert.equal(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='pending_block'").get(), undefined);
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("real sync retries beyond the D1 batch boundary without doubling LP inventory, then resumes failed post-processing", async () => {
  const h = fixture(); seed(h, "alice", 100);
  h.sqlite.exec(`INSERT INTO pools(lp_asset,pair,asset_a,asset_b,updated_at) VALUES('LP','AAA_XCP','AAA','XCP',1);
    INSERT INTO pool_updates(event,event_index,tx_hash,block_index,block_time,lp_asset,pair,asset_a,asset_b)
    VALUES('OPEN_POOL',0,'open',1,1800000001,'LP','AAA_XCP','AAA','XCP');
    INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING');`);
  await h.db.batch(checkpointStatements(h.db, block(1)));
  const original = globalThis.fetch;
  const events = Array.from({ length: 60 }, (_, index) => ({ event: "CREDIT", event_index: index + 1,
    tx_hash: `tx${index}`, block_index: 2, params: { address: "alice", asset: "LP", quantity: 1, quantity_normalized: 1 } }));
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: block(2) });
    if (path.endsWith("/events")) return Response.json({ result: events, next_cursor: null });
    return Response.json({ result: block(Number(path.split("/")[2])) });
  };
  try {
    h.fail(sql => sql.includes("INTO pool_lp_balance_snapshots"));
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "Injected");
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 150 });
    h.fail(sql => sql.includes("DELETE FROM pool_address_fee_totals"));
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "Injected");
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 160 });
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balance_snapshots").get(), { balance_raw: 160 });
    assert.ok(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='pending_postprocess'").get());
    h.fail(() => false);
    assert.equal((await syncBlocks(h.db, "https://core.test", 10)).blocks_processed, 0);
    assert.equal(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='pending_postprocess'").get(), undefined);
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 160 });
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("catch-up cannot join an old applied parent to a new branch whose own hash remains stable", async () => {
  const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  const original = globalThis.fetch; let thirdStarted = false;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: block(3) });
    const height = Number(path.split("/")[2]);
    if (height === 3) thirdStarted = true;
    if (path.endsWith("/events")) return Response.json({ result: [], next_cursor: null });
    return Response.json({ result: block(height, thirdStarted && height === 2 ? "b" : "a") });
  };
  try {
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "Applied chain changed");
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "2" });
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});
