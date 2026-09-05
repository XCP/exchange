const TTL_SECONDS = 3600;
const MAX_BODY_BYTES = 1_000_000;
const pendingByDatabase = new WeakMap<D1Database, Map<string, Promise<Response>>>();

/** Canonical, bounded public variants only. Arbitrary tags/quote assets never
 * create database cache entries. Raw URL ordering, aliases and unused params
 * must not cause another global aggregate. */
export function analyticsCacheKey(request: Request): string | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/analytics" || url.searchParams.get("tag")) return null;
  const rawTimeframe = url.searchParams.get("timeframe");
  const timeframe = rawTimeframe === "30d" || rawTimeframe === "1y" || rawTimeframe === "all"
    ? rawTimeframe : "24h";
  const section = url.searchParams.get("section") ?? "all";
  // An absent section means all; literal section=all is not supported by the
  // route and must not be confused with that default.
  if (url.searchParams.has("section") && !["summary", "charts", "traders"].includes(section)) return null;
  const quote = url.searchParams.get("quote_asset") || "XCP";
  if (quote !== "XCP" && quote !== "BTC") return null;
  const hidden = url.searchParams.get("include_hidden") === "1" ? "1" : "0";
  return `v1/${timeframe}/${hidden}/${section}/${section === "charts" ? "-" : quote}`;
}

/** Shared cache at the route's existing one-hour freshness bound. A hit's
 * edge TTL is its remaining lifetime, never a fresh extra hour. Concurrent
 * requests in this isolate share a producer; cold requests in different
 * isolates can duplicate work, but never wait on a lock or serve stale data. */
export async function cachedAnalytics(
  request: Request,
  db: D1Database,
  producer: () => Promise<Response>,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<Response> {
  const key = analyticsCacheKey(request);
  if (key === null) return producer();
  let pending = pendingByDatabase.get(db);
  if (!pending) { pending = new Map(); pendingByDatabase.set(db, pending); }
  const existing = pending.get(key);
  if (existing) return (await existing).clone();

  const load = async (): Promise<Response> => {
    const cacheDb = typeof db.withSession === "function" ? db.withSession("first-primary") : db;
    const hit = await cacheDb.prepare(
      `SELECT body, expires_at FROM analytics_response_cache WHERE cache_key = ?`
    ).bind(key).first<{ body: string; expires_at: number }>().catch(() => null);
    const remaining = hit ? hit.expires_at - now() : 0;
    if (hit && remaining > 0) {
      return new Response(hit.body, { headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${Math.min(TTL_SECONDS, remaining)}`,
        "x-analytics-cache": "HIT",
      } });
    }
    const startedAt = now();
    const response = await producer();
    if (!response.ok) return response;
    const body = await response.clone().text();
    // Preserve response availability if D1 cache writes fail or a future
    // response becomes too large for a practical D1 row.
    if (new TextEncoder().encode(body).byteLength <= MAX_BODY_BYTES) {
      await cacheDb.prepare(
        `INSERT INTO analytics_response_cache(cache_key, body, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET body=excluded.body, expires_at=excluded.expires_at`
      ).bind(key, body, startedAt + TTL_SECONDS).run().catch(() => {});
    }
    const result = new Response(response.body, response);
    result.headers.set("cache-control", `public, max-age=${Math.max(0, startedAt + TTL_SECONDS - now())}`);
    result.headers.set("x-analytics-cache", "MISS");
    return result;
  };
  const promise = load();
  pending.set(key, promise);
  try {
    return (await promise).clone();
  } finally {
    if (pending.get(key) === promise) pending.delete(key);
  }
}
