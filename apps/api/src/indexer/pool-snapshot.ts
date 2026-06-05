import { API_TIMEOUT_MS } from "../lib/constants";
import { batchExec } from "../lib/batch";
import { buildPoolSnapshotStmt, refreshPoolAggregates } from "./pools";
import { deleteState, getState, setState } from "./state";

interface CounterpartyPoolResponse {
  result: Record<string, unknown>[];
  next_cursor: number | null;
}

async function fetchPoolsPage(
  apiBase: string,
  cursor: string | null,
  limit: number
): Promise<CounterpartyPoolResponse> {
  const url = new URL(`${apiBase}/pools`);
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to fetch pools: ${res.status}`);
  return res.json();
}

export async function syncPools(
  db: D1Database,
  apiBase: string,
  maxPages: number = 10,
  startCursor: string | null = null
): Promise<{ synced: number; pages: number; next_cursor: string | null }> {
  const now = Math.floor(Date.now() / 1000);
  const limit = 200;
  let cursor: string | null = startCursor ?? await getState(db, "pool_snapshot_cursor");
  let synced = 0;
  let pages = 0;
  const affected = new Set<string>();

  while (pages < maxPages) {
    const data = await fetchPoolsPage(apiBase, cursor, limit);
    pages++;

    const stmts = data.result
      .map((pool) => buildPoolSnapshotStmt(pool, now))
      .filter((pool): pool is NonNullable<typeof pool> => pool != null);

    await batchExec(db, stmts.map((pool) => {
      affected.add(pool.lpAsset);
      return pool.stmt(db);
    }));

    synced += stmts.length;
    if (!data.next_cursor || data.result.length === 0) {
      cursor = null;
      await deleteState(db, "pool_snapshot_cursor");
      break;
    }
    cursor = String(data.next_cursor);
    await setState(db, "pool_snapshot_cursor", cursor);
  }

  for (const lpAsset of affected) {
    await refreshPoolAggregates(db, lpAsset);
  }

  return { synced, pages, next_cursor: cursor };
}
