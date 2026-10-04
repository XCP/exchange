import { initializeUndo, restoreUndo, writeWithUndo } from "../src/indexer/reorg-undo";
import { freshCounterpartyUrl } from "../src/lib/fresh-read";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { checkpointStatements, findCommonCheckpoint } from "../src/indexer/block-checkpoint";
import { addLpDelta, addBalanceSnapshots, allocatePoolFees, loadAppliedPoolBalances, type PendingPoolBalances } from "../src/indexer/pool-accounting";
import { syncBlocks } from "../src/indexer/sync-block";
import { repairUnaccountedDispenses } from "../src/indexer/dispense-accounting-repair";

function same(actual: unknown, expected: unknown) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const statements: string[] = [];
  for (const file of readdirSync("migrations").filter(file => file.endsWith(".sql")).sort()) {
    try { sqlite.exec(readFileSync(`migrations/${file}`, "utf8")); }
    catch (error) {
      // Pre-existing migration replay drift, also pinned in query-plans.test.
      if (!(error instanceof Error) || error.message !== "duplicate column name: reserve_a_before") throw error;
    }
  }
  sqlite.exec("INSERT INTO reorg_undo_state(singleton,floor) VALUES(1,0)");
  let fail: (sql: string) => boolean = () => false;
  class Statement {
    values: unknown[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) { this.values = values; return this; }
    async all() { statements.push(this.sql); return { results: sqlite.prepare(this.sql).all(...this.values) }; }
    async first() { statements.push(this.sql); return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async run() {
      statements.push(this.sql);
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
  return { sqlite, db, statements, fail: (f: typeof fail) => { fail = f; } };
}

async function rejects(run: () => Promise<unknown>, text: string) {
  let caught = false;
  try { await run(); } catch (error) { caught = true; assert.ok(String(error).includes(text), String(error)); }
  assert.ok(caught, `Expected failure: ${text}`);
}

const block = (height: number, branch = "a") => ({ block_index: height, block_hash: branch.repeat(62) + String(height).padStart(2, "0"), block_time: 1_800_000_000 + height, previous_block_hash: (height === 2 ? "a" : branch).repeat(62) + String(height - 1).padStart(2, "0") });
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
  same(await findCommonCheckpoint(h.db, 3, async height => block(height, height > 1 ? "b" : "a").block_hash), { block_index: 1, block_hash: block(1).block_hash, block_time: block(1).block_time });
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

function interruptedEventBody() {
  let pulls = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(new TextEncoder().encode('{"result":[{"event":"CREDIT"'));
      else controller.error(new Error("Network connection lost."));
    },
  }), { headers: { "Content-Type": "application/json" } });
}

test("a dropped event-page body resumes the same cursor without restarting sync or duplicating LP credits", async () => {
  const h = fixture(); seed(h, "alice", 100);
  h.sqlite.exec(`INSERT INTO pools(lp_asset,pair,asset_a,asset_b,updated_at) VALUES('LP','AAA_XCP','AAA','XCP',1);
    INSERT INTO pool_updates(event,event_index,tx_hash,block_index,block_time,lp_asset,pair,asset_a,asset_b)
    VALUES('OPEN_POOL',0,'open',1,1800000001,'LP','AAA_XCP','AAA','XCP');
    INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING');`);
  await h.db.batch(checkpointStatements(h.db, block(1)));
  h.statements.length = 0;
  const original = globalThis.fetch;
  const cursors: (string | null)[] = [];
  let interrupted = false, requests = 0, syncRuns = 1;
  globalThis.fetch = async input => {
    requests++;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/last")) return Response.json({ result: block(2) });
    if (url.pathname.endsWith("/events")) {
      const cursor = url.searchParams.get("cursor"); cursors.push(cursor);
      if (cursor && !interrupted) { interrupted = true; return interruptedEventBody(); }
      const eventIndex = cursor ? 2 : 1;
      return Response.json({ result: [{ event: "CREDIT", event_index: eventIndex,
        tx_hash: `credit${eventIndex}`, block_index: 2,
        params: { address: "alice", asset: "LP", quantity: 10, quantity_normalized: 10 } }],
        next_cursor: cursor ? null : 100 });
    }
    return Response.json({ result: block(Number(url.pathname.split("/")[2])) });
  };
  try {
    // The old implementation only recovered on a subsequent scheduled invocation.
    try { await syncBlocks(h.db, "https://core.test", 10); }
    catch (error) {
      assert.ok(String(error).includes("Network connection lost."));
      syncRuns++;
      await syncBlocks(h.db, "https://core.test", 10);
    }
    console.log(JSON.stringify({ scenario: "interrupted_event_page", syncRuns, requests,
      eventPageRequests: cursors.length, sqlExecutions: h.statements.length }));
    assert.equal(syncRuns, 1);
    same(cursors, [null, "100", "100"]);
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 120 });
    same(h.sqlite.prepare("SELECT COUNT(*) n FROM pool_lp_balance_events").get(), { n: 2 });
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "2" });
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("persistent event transport failure stops after one retry and preserves the committed checkpoint", async () => {
  const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  const original = globalThis.fetch; let eventRequests = 0;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: block(2) });
    if (path.endsWith("/events")) { eventRequests++; return interruptedEventBody(); }
    return Response.json({ result: block(Number(path.split("/")[2])) });
  };
  try {
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "Network connection lost.");
    assert.equal(eventRequests, 2);
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "1" });
    assert.equal(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='pending_block'").get(), undefined);
    assert.equal(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='sync_lock'").get(), undefined);
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("event-page HTTP throttling and invalid JSON do not trigger immediate transport retries", async () => {
  for (const failure of [() => new Response(null, { status: 429 }), () => new Response('{"result":')]) {
    const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
    h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
    const original = globalThis.fetch; let eventRequests = 0;
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/last")) return Response.json({ result: block(2) });
      if (path.endsWith("/events")) { eventRequests++; return failure(); }
      return Response.json({ result: block(Number(path.split("/")[2])) });
    };
    try {
      let rejected = false;
      try { await syncBlocks(h.db, "https://core.test", 10); } catch { rejected = true; }
      assert.ok(rejected);
      assert.equal(eventRequests, 1);
      same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "1" });
    } finally { globalThis.fetch = original; h.sqlite.close(); }
  }
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
    same(h.sqlite.prepare("SELECT balance_raw FROM pool_lp_balances").get(), { balance_raw: 140 });
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


test("real dispense ingestion cannot checkpoint failed allocation; retry prices the complete bundle", async () => {
  const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/last")) return Response.json({ result: block(2) });
    if (url.pathname.endsWith("/events")) return Response.json({ result: ["AAA", "BBB"].map((asset, i) => ({
      event: "DISPENSE", event_index: i, tx_hash: "bundle", block_index: 2,
      params: { tx_hash: "bundle", dispense_index: i, dispenser_tx_hash: asset, asset,
        source: "seller", destination: "buyer", dispense_quantity_normalized: "1", btc_amount_normalized: "0.02" },
    })), next_cursor: null });
    return Response.json({ result: block(Number(url.pathname.split("/")[2])) });
  };
  try {
    h.fail(sql => sql.includes("UPDATE dispenses SET quote_volume"));
    await rejects(() => syncBlocks(h.db, "https://core.test", 10), "Injected");
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "1" });
    h.fail(() => false);
    await syncBlocks(h.db, "https://core.test", 10);
    same(h.sqlite.prepare("SELECT SUM(quote_volume) v, COUNT(*) n, MIN(payment_asset_count) c FROM dispenses").get(), { v: 0.02, n: 2, c: 2 });
    same(h.sqlite.prepare("SELECT SUM(total_btc_spent) v FROM dispenser_stats").get(), { v: 0.02 });
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "2" });
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});

test("deployment-gap repair survives stats failure and excludes incomplete blocks", async () => {
  const h = fixture();
  for (const [asset, index, height] of [["AAA", 0, 1], ["BBB", 1, 1], ["CCC", 0, 2]]) {
    h.sqlite.prepare(`INSERT INTO dispenses(tx_hash,dispense_index,asset,source,destination,dispenser_tx_hash,
      dispense_quantity,btc_amount,price,block_index,block_time)
      VALUES (?,?,?,'seller','buyer','missing',1,0.02,0.02,?,?)`).run(`bundle${height}`, index, asset, height, block(1).block_time);
  }
  try {
    h.fail(sql => sql.includes("INSERT INTO dispenser_stats"));
    await rejects(() => repairUnaccountedDispenses(h.db, 1), "Injected");
    same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='dispense_accounting_pending_block'").get(), { value: "1" });
    h.fail(() => false);
    await repairUnaccountedDispenses(h.db, 1);
    same(h.sqlite.prepare("SELECT SUM(total_btc_spent) v FROM dispenser_stats").get(), { v: 0.02 });
    same(h.sqlite.prepare("SELECT payment_asset_count c FROM dispenses WHERE block_index=2").get(), { c: 0 });
    const before = h.sqlite.prepare("SELECT total_changes() n").get();
    await repairUnaccountedDispenses(h.db, 1);
    same(h.sqlite.prepare("SELECT total_changes() n").get(), before);
    const plan = h.sqlite.prepare(`EXPLAIN QUERY PLAN SELECT block_index FROM dispenses
      WHERE payment_asset_count = 0 AND block_index <= 1 ORDER BY block_index LIMIT 1`).all();
    assert.ok(JSON.stringify(plan).includes("idx_dispenses_unaccounted"));
  } finally { h.sqlite.close(); }
});


test("exact undo restores partial fills and closing dispensers; interruption resumes", async () => {
  const h = fixture();
  h.sqlite.exec(`INSERT INTO orders(tx_hash,tx_index,pair,base_asset,quote_asset,source,side,price,amount,give_remaining,get_remaining,expiration,block_index,block_time,first_seen_at,remaining)
    VALUES('order',1,'AAA_XCP','AAA','XCP','alice','sell',2,100,80,160,0,1,1,1,80);
    INSERT INTO dispensers(tx_hash,tx_index,asset,source,give_quantity,escrow_quantity,give_remaining,satoshi_price,price,block_index,block_time,first_seen_at)
    VALUES('dispenser',2,'AAA','alice',10,100,70,100,1,1,1,1);`);
  await writeWithUndo(h.db, [
    { block: 2, statement: h.db.prepare("UPDATE orders SET give_remaining=0,get_remaining=0,remaining=0,status='filled' WHERE tx_hash='order'") },
    { block: 2, statement: h.db.prepare("UPDATE dispensers SET give_remaining=0,status=11,dispense_count=7 WHERE tx_hash='dispenser'") },
  ]);
  same(h.sqlite.prepare("SELECT COUNT(*) n FROM reorg_undo_context").get(), { n: 0 });
  h.fail(sql => sql.includes("DELETE FROM reorg_undo WHERE seq"));
  await rejects(() => restoreUndo(h.db, 1), "Injected");
  same(h.sqlite.prepare("SELECT status FROM dispensers").get(), { status: 11 });
  h.fail(() => false);
  await restoreUndo(h.db, 1); await restoreUndo(h.db, 1);
  same(h.sqlite.prepare("SELECT give_remaining,get_remaining,remaining,status,expire_index FROM orders").get(),
    { give_remaining: 80, get_remaining: 160, remaining: 80, status: 'open', expire_index: null });
  same(h.sqlite.prepare("SELECT give_remaining,status,dispense_count FROM dispensers").get(), { give_remaining: 70, status: 0, dispense_count: 0 });
  h.sqlite.exec("DELETE FROM reorg_undo_state"); await initializeUndo(h.db, 100);
  await rejects(() => restoreUndo(h.db, 99), "predates exact undo");
  h.sqlite.close();
});

test("fresh reads cannot hit a retained URL cache, even at fixed continuation cursors", () => {
  const urls = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const url = new URL(freshCounterpartyUrl("https://core.test/blocks/2/events?cursor=100&limit=100&verbose=true"));
    assert.equal(url.searchParams.get("cursor"), "100");
    assert.equal(url.searchParams.get("limit"), "100");
    assert.equal(url.searchParams.get("verbose"), "true");
    urls.add(url.toString());
  }
  assert.equal(urls.size, 300);
});

test("a stale height lookup cannot hide a replacement header's different parent", async () => {
  const h = fixture();
  h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
  await h.db.batch(checkpointStatements(h.db, block(1)));
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/events')) return Response.json({result: [], next_cursor: null});
    if (path.endsWith('/last') || path.endsWith('/2')) return Response.json({result: {...block(2, 'b'), previous_block_hash: block(1, 'b').block_hash}});
    return Response.json({result: block(1)});
  };
  try { await rejects(() => syncBlocks(h.db, 'https://core.test'), 'Applied chain changed'); }
  finally { globalThis.fetch = original; h.sqlite.close(); }
});
import { syncOrders } from "../src/indexer/snapshot";
import { buildOrderUpsertStmt, normalizeOrder } from "../src/indexer/normalize";
import type { Order } from "../src/lib/counterparty";

const orderHistory = JSON.parse(readFileSync("tests/fixtures/order-reconciliation.json", "utf8")) as {
  orders: Record<string, Order>;
  blocks: Record<string, { event: string; event_index: number; tx_hash: string; block_index?: number; params: Record<string, unknown> }[]>;
};
const historicalOrders = Object.values(orderHistory.orders);
const staleOrders = historicalOrders.filter(order => order.status === "filled");
const missingOrders = historicalOrders.filter(order => order.status === "open");

for (const height of [961106, 963588, 964435]) {
  test(`historical order block ${height} replays creations and terminal statuses`, async () => {
    const h = fixture();
    await h.db.batch(checkpointStatements(h.db, block(1)));
    h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
    const events = orderHistory.blocks[String(height)];
    const created = new Set(events.filter(e => e.event === "OPEN_ORDER").map(e => String(e.params.tx_hash)));
    for (const order of staleOrders) {
      if (!created.has(order.tx_hash)) await buildOrderUpsertStmt(h.db, normalizeOrder(order), 1).run();
    }
    if (height === 964435) {
      for (const event of events) h.sqlite.prepare("INSERT INTO deal_scores(listing_id,listing_type,asset,quote,listing_price) VALUES(?,'order','XCP','BTC',1)").run(String(event.params.tx_hash));
    }
    const original = globalThis.fetch;
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/events")) {
        const requested = new Set(url.searchParams.get("event_name")?.split(","));
        return Response.json({ result: events.filter(e => requested.has(e.event)).map(e => ({
          ...e, block_index: 2, params: { ...e.params, block_index: 2 },
        })), next_cursor: null });
      }
      if (url.pathname.includes("/orders/")) return Response.json({ result: orderHistory.orders[url.pathname.split("/").pop()!] });
      return Response.json({ result: block(url.pathname.endsWith("/last") ? 2 : Number(url.pathname.split("/")[2])) });
    };
    try {
      await syncBlocks(h.db, "https://core.test", 1);
      if (height === 961106) {
        same(h.sqlite.prepare("SELECT COUNT(*) n FROM orders WHERE expiration=0 AND expire_index IS NULL AND status='open'").get(), { n: 11 });
      } else {
        const affected = events.filter(e => e.params.status === "filled").map(e => String(e.params.tx_hash));
        assert.equal(affected.length, 2);
        for (const hash of affected) {
          const row = h.sqlite.prepare("SELECT status,give_remaining,get_remaining FROM orders WHERE tx_hash=?").get(hash);
          same(row, { status: "filled", give_remaining: Number(orderHistory.orders[hash].give_remaining_normalized), get_remaining: Number(orderHistory.orders[hash].get_remaining_normalized) });
        }
      }
      if (height === 964435) same(h.sqlite.prepare("SELECT COUNT(*) n FROM deal_scores").get(), { n: 0 });
      same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "2" });
    } finally { globalThis.fetch = original; h.sqlite.close(); }
  });
}

test("ORDER_UPDATE replays event amounts instead of a later filled snapshot; lookup failures cannot checkpoint", async () => {
  for (const missingMetadata of [false, true]) {
    const h = fixture(); await h.db.batch(checkpointStatements(h.db, block(1)));
    h.sqlite.exec("INSERT OR REPLACE INTO indexer_state VALUES('indexer_mode','FOLLOWING')");
    const order = staleOrders.find(o => o.give_asset === "BTC")!;
    await buildOrderUpsertStmt(h.db, normalizeOrder(order), 1).run();
    const original = globalThis.fetch;
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname;
      if (path.includes("/orders/")) return Response.json({ result: missingMetadata ? null : order });
      if (path.endsWith("/events")) return Response.json({ result: [{ event: "ORDER_UPDATE", event_index: 1, tx_hash: "partial", block_index: 2,
        params: { tx_hash: order.tx_hash, status: "open", give_remaining: 50000, get_remaining: 2000000000 } }], next_cursor: null });
      return Response.json({ result: block(path.endsWith("/last") ? 2 : Number(path.split("/")[2])) });
    };
    try {
      if (missingMetadata) {
        await rejects(() => syncBlocks(h.db, "https://core.test", 1), "Cannot verify order metadata");
        same(h.sqlite.prepare("SELECT value FROM indexer_state WHERE key='last_block_index'").get(), { value: "1" });
      } else {
        await syncBlocks(h.db, "https://core.test", 1);
        same(h.sqlite.prepare("SELECT give_remaining,get_remaining,status FROM orders WHERE tx_hash=?").get(order.tx_hash), { give_remaining: 0.0005, get_remaining: 20, status: "open" });
        await restoreUndo(h.db, 1);
        same(h.sqlite.prepare("SELECT give_remaining FROM orders WHERE tx_hash=?").get(order.tx_hash), { give_remaining: 0.00000001 });
      }
    } finally { globalThis.fetch = original; h.sqlite.close(); }
  }
});

for (const failure of ["missing lookup", "empty continuation", "repeated cursor", "malformed quantity", "changed tip", "conflicting status"]) {
  test(`order snapshot writes nothing after ${failure}`, async () => {
    const h = fixture();
    await buildOrderUpsertStmt(h.db, normalizeOrder(staleOrders[0]), 1).run();
    const before = h.sqlite.prepare("SELECT * FROM orders").all();
    let anchors = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/last")) return Response.json({ result: { ...block(2, failure === "changed tip" && anchors++ > 0 ? "b" : "a"), ledger_hash: "ledger", messages_hash: "messages" } });
      if (url.pathname.endsWith("/orders")) {
        if (failure === "empty continuation") return Response.json({ result: [], next_cursor: 100 });
        if (failure === "repeated cursor") return Response.json({ result: [missingOrders[url.searchParams.has("cursor") ? 1 : 0]], next_cursor: 100 });
        const order = failure === "malformed quantity" ? { ...missingOrders[0], give_quantity_normalized: "invalid" } : missingOrders[0];
        return Response.json({ result: [order], next_cursor: null });
      }
      return Response.json({ result: failure === "missing lookup" ? null : { ...staleOrders[0], status: failure === "conflicting status" ? "open" : "filled" } });
    };
    try {
      let threw = false; try { await syncOrders(h.db, "https://core.test"); } catch { threw = true; }
      assert.ok(threw); same(h.sqlite.prepare("SELECT * FROM orders").all(), before);
    } finally { globalThis.fetch = original; h.sqlite.close(); }
  });
}

test("verified snapshot repairs the historical eleven missing and four stale orders, preserving BTC dust", async () => {
  const h = fixture();
  for (const order of staleOrders) await buildOrderUpsertStmt(h.db, normalizeOrder(order), 1).run();
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/last")) return Response.json({ result: { ...block(2), ledger_hash: "ledger", messages_hash: "messages" } });
    if (path.endsWith("/orders")) return Response.json({ result: missingOrders, next_cursor: null });
    return Response.json({ result: orderHistory.orders[path.split("/").pop()!] });
  };
  try {
    same(await syncOrders(h.db, "https://core.test"), { synced: 11, closed: 4 });
    same(h.sqlite.prepare("SELECT COUNT(*) n FROM orders WHERE status='open'").get(), { n: 11 });
    for (const order of staleOrders) same(h.sqlite.prepare("SELECT status,give_remaining,get_remaining FROM orders WHERE tx_hash=?").get(order.tx_hash), {
      status: "filled", give_remaining: Number(order.give_remaining_normalized), get_remaining: Number(order.get_remaining_normalized),
    });
  } finally { globalThis.fetch = original; h.sqlite.close(); }
});
