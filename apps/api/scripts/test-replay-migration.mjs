import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";

// Exercise the Worker/D1 path too, not only node:sqlite. Do not contact remote D1.
const proxy = await getPlatformProxy({ configPath: "scripts/replay-test.wrangler.toml", persist: false, remoteBindings: false });
try {
  const db = proxy.env.DB;
  for (const file of ["0024_pool_accounting.sql", "0051_replay_integrity.sql"]) {
    const sql = readFileSync(`migrations/${file}`, "utf8");
    // Remote D1's parser has treated a naked CASE END as a trigger END.
    // https://github.com/cloudflare/workers-sdk/issues/4727
    if (file.startsWith("0051")) assert.doesNotMatch(sql, /\bSELECT\s+CASE\b/i);
    const statements = unstable_splitSqlQuery(sql);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO pool_lp_balance_events
    (event,tx_hash,event_index,block_index,block_time,lp_asset,pair,address,holder,delta_raw,delta,reason)
    VALUES('CREDIT','tx',1,1,1,'LP','AAA_XCP','alice','alice',10,10,'test')`);
  await db.batch([insert, insert]);
  assert.equal(await db.prepare("SELECT balance_raw FROM pool_lp_balances").first("balance_raw"), 10);
  await db.prepare("DELETE FROM pool_lp_balance_events").run();
  assert.equal(await db.prepare("SELECT balance_raw FROM pool_lp_balances").first("balance_raw"), 0);
  console.log("Worker D1 replay migration and trigger effects passed");
} finally { await proxy.dispose(); }
