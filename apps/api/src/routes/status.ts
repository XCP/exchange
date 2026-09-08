const COUNTS_TTL_SECONDS = 300;
const COUNTS_KEY = "status/counts/v1";
const COUNTS_SQL = {
  trades: "SELECT COUNT(*) as cnt FROM trades",
  pairs: "SELECT COUNT(*) as cnt FROM pair_stats",
  open_orders: "SELECT COUNT(*) as cnt FROM orders WHERE status = 'open'",
  dispenses: "SELECT COUNT(*) as cnt FROM dispenses",
  open_dispensers: "SELECT COUNT(*) as cnt FROM dispensers WHERE status < 10",
  pools: "SELECT COUNT(*) as cnt FROM pools",
  candles: "SELECT COUNT(*) as cnt FROM candles",
} as const;
type Counts = Record<keyof typeof COUNTS_SQL, number>;

function parseCounts(body: string): Counts | null {
  try {
    const value = JSON.parse(body) as Counts | null;
    return value && Object.keys(COUNTS_SQL).every((key) => {
      const count = value[key as keyof Counts];
      return Number.isSafeInteger(count) && count >= 0;
    }) ? Object.fromEntries(Object.keys(COUNTS_SQL).map(key => [key, value[key as keyof Counts]])) as Counts : null;
  } catch {
    return null;
  }
}

/** Only the expensive table counters are shared. Indexer state is read on
 * every origin request, and neither the shared nor edge cache can extend the
 * counters' existing five-minute freshness bound. One fixed key covers all
 * public hosts and query strings; no request-dependent data is persisted. */
export async function handleStatus(
  db: D1Database,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<Response> {
  const cacheDb = typeof db.withSession === "function" ? db.withSession("first-primary") : db;
  const hit = await cacheDb.prepare(
    "SELECT body, expires_at FROM analytics_response_cache WHERE cache_key = ?",
  ).bind(COUNTS_KEY).first<{ body: string; expires_at: number }>().catch(() => null);
  const cachedCounts = hit && hit.expires_at > now() ? parseCounts(hit.body) : null;
  let expiresAt = hit?.expires_at ?? 0;
  let counts: Counts;
  if (cachedCounts) {
    counts = cachedCounts;
  } else {
    expiresAt = now() + COUNTS_TTL_SECONDS;
    const keys = Object.keys(COUNTS_SQL) as (keyof Counts)[];
    const results = await db.batch(keys.map((key) => db.prepare(COUNTS_SQL[key])));
    counts = Object.fromEntries(keys.map((key, index) => [
      key, (results[index].results[0] as { cnt: number } | undefined)?.cnt ?? 0,
    ])) as Counts;
    // Reuse the existing small response-cache table. A storage failure must
    // not prevent status from returning or suppress a subsequent retry.
    await cacheDb.prepare(
      `INSERT INTO analytics_response_cache(cache_key, body, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET body=excluded.body, expires_at=excluded.expires_at`,
    ).bind(COUNTS_KEY, JSON.stringify(counts), expiresAt).run().catch(() => {});
  }

  const state = await db.prepare("SELECT key, value FROM indexer_state")
    .all<{ key: string; value: string }>();
  const indexer = Object.fromEntries(state.results
    .filter((row) => row.key !== "aggregation_offset")
    .map((row) => [row.key, row.value]));
  const mode = indexer.indexer_mode ?? "IDLE";
  const lastRunTime = Number(indexer.last_run_time ?? 0);
  const age = Number.isFinite(lastRunTime) && lastRunTime > 0
    ? Math.max(0, now() - lastRunTime) : null;
  const healthy = mode === "FOLLOWING" && age !== null && age <= 15 * 60;
  return Response.json({
    ok: healthy,
    mode,
    indexer_healthy: healthy,
    indexer_age_seconds: age,
    ...counts,
    indexer,
  }, { headers: {
    "Cache-Control": `public, max-age=${Math.max(0, Math.min(COUNTS_TTL_SECONDS, expiresAt - now()))}`,
    "X-Status-Counts-Cache": cachedCounts ? "HIT" : "MISS",
  } });
}
