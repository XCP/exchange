export interface BlockCheckpoint {
  block_index: number;
  block_hash: string;
  block_time: number;
}

export const CHECKPOINT_RETENTION = 24;

export function checkpointStatements(db: D1Database, block: BlockCheckpoint): D1PreparedStatement[] {
  if (!Number.isSafeInteger(block.block_index) || block.block_index < 0 ||
      !Number.isSafeInteger(block.block_time) || block.block_time <= 0 ||
      !/^[a-f0-9]{64}$/i.test(block.block_hash)) {
    throw new Error("Invalid block checkpoint");
  }
  return [
    db.prepare(`INSERT INTO indexer_state(key, value) VALUES
      ('last_block_index', ?), ('last_block_hash', ?), ('last_block_time', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`)
      .bind(String(block.block_index), block.block_hash, String(block.block_time)),
    db.prepare(`INSERT INTO indexer_block_checkpoints(block_index, block_hash, block_time)
      VALUES (?, ?, ?) ON CONFLICT(block_index) DO UPDATE SET
      block_hash = excluded.block_hash, block_time = excluded.block_time
      WHERE block_hash != excluded.block_hash OR block_time != excluded.block_time`)
      .bind(block.block_index, block.block_hash, block.block_time),
    db.prepare(`DELETE FROM indexer_block_checkpoints WHERE block_index < ? OR block_index > ?`)
      .bind(block.block_index - CHECKPOINT_RETENTION, block.block_index),
  ];
}

export async function findCommonCheckpoint(
  db: D1Database,
  tip: number,
  fetchHash: (height: number) => Promise<string>,
): Promise<BlockCheckpoint> {
  const rows = await db.prepare(`SELECT block_index, block_hash, block_time
    FROM indexer_block_checkpoints WHERE block_index <= ? ORDER BY block_index DESC LIMIT ?`)
    .bind(tip, CHECKPOINT_RETENTION + 1).all<BlockCheckpoint>();
  for (const row of rows.results) {
    if (await fetchHash(row.block_index) === row.block_hash) return row;
  }
  throw new Error("No verified common checkpoint in retained history; operator recovery required");
}
