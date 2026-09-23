import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";

// Real local D1: seed OLD data, then run the shipping migration, including stats.
const proxy = await getPlatformProxy({ configPath: "scripts/replay-test.wrangler.toml", persist: false, remoteBindings: false });
try {
  const db = proxy.env.DB;
  const apply = async (file) => {
    const statements = unstable_splitSqlQuery(readFileSync(`migrations/${file}`, "utf8"));
    await db.batch(statements.map(sql => db.prepare(sql)));
  };
  for (const file of ["0001_init.sql", "0002_dispenser_stats_totals.sql", "0003_base_volume.sql",
    "0031_rolling_1y_window.sql", "0050_analytics_response_cache.sql"]) await apply(file);

  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 151; i++) {
    const asset = `POKEMON${String(i).padStart(3, "0")}`;
    await db.batch([
      db.prepare(`INSERT INTO dispensers(tx_hash,tx_index,asset,source,give_quantity,escrow_quantity,
        give_remaining,satoshi_price,price,status,block_index,block_time,first_seen_at)
        VALUES (?,0,?,'seller',1,1,0,2000000,0.02,10,1,?,?)`).bind(asset, asset, now, now),
      db.prepare(`INSERT INTO dispenses(tx_hash,dispense_index,asset,block_index,block_time,
        source,destination,dispense_quantity,btc_amount,price,dispenser_tx_hash)
        VALUES ('pokemon',?,?,1,?,'seller','buyer',1,0.02,0.02,?)`).bind(i, asset, now, asset),
      db.prepare(`INSERT INTO dispenser_stats(asset,total_btc_spent,last_dispense_price,volume_24h,volume_30d,volume_1y)
        VALUES (?,0.02,0.02,0.02,0.02,0.02)`).bind(asset),
    ]);
  }
  await db.prepare("INSERT INTO analytics_response_cache VALUES ('old','inflated',9999999999)").run();
  await apply("0052_dispense_payment_accounting.sql");
  const event = await db.prepare("SELECT SUM(quote_volume) v, SUM(btc_amount) raw FROM dispenses").first();
  assert.ok(Math.abs(event.v - 0.02) < 1e-12);
  assert.ok(Math.abs(event.raw - 3.02) < 1e-12);
  const stats = await db.prepare(`SELECT SUM(total_btc_spent) total, SUM(volume_24h) v24,
    SUM(volume_30d) v30, SUM(volume_1y) v1y, MAX(last_dispense_price) price FROM dispenser_stats`).first();
  for (const key of ["total", "v24", "v30", "v1y"]) assert.ok(Math.abs(stats[key] - 0.02) < 1e-12, key);
  assert.ok(Math.abs(stats.price - 0.02 / 151) < 1e-12);
  assert.equal(await db.prepare("SELECT COUNT(*) n FROM analytics_response_cache").first("n"), 0);
  console.log("Local D1 dispenser migration: historical allocations, stats, raw preservation and cache invalidation passed");
} finally { await proxy.dispose(); }
