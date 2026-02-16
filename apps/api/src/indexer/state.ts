export type IndexerMode =
  | "IDLE"
  | "BACKFILL_TRADES"
  | "BACKFILL_DISPENSES"
  | "SNAPSHOT_SYNC"
  | "BUILD_AGGREGATES"
  | "REFRESH_STATS"
  | "FOLLOWING";

export async function getMode(db: D1Database): Promise<IndexerMode> {
  const row = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'indexer_mode'`)
    .first<{ value: string }>();
  return (row?.value as IndexerMode) ?? "IDLE";
}

export async function setMode(
  db: D1Database,
  mode: IndexerMode
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(mode)
    .run();
}

export async function getState(
  db: D1Database,
  key: string
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setState(
  db: D1Database,
  key: string,
  value: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO indexer_state (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(key, value)
    .run();
}

export async function deleteState(
  db: D1Database,
  key: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM indexer_state WHERE key = ?`)
    .bind(key)
    .run();
}
