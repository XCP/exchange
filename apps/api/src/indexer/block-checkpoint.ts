export interface BlockCheckpoint {
  block_index: number;
  block_hash: string;
  block_time: number;
  ledger_hash?: string | null;
  messages_hash?: string | null;
}

export function sameBlockIdentity(stored: BlockCheckpoint, fresh: BlockCheckpoint): boolean {
  return stored.block_hash === fresh.block_hash
    && (stored.ledger_hash == null || stored.ledger_hash === fresh.ledger_hash)
    && (stored.messages_hash == null || stored.messages_hash === fresh.messages_hash);
}

export function requireProtocolIdentity(block: BlockCheckpoint): void {
  if (!/^[a-f0-9]{64}$/i.test(block.ledger_hash ?? "") || !/^[a-f0-9]{64}$/i.test(block.messages_hash ?? ""))
    throw new Error("Parsed block protocol hashes unavailable");
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
    db.prepare(`INSERT INTO indexer_block_checkpoints(block_index, block_hash, block_time,ledger_hash,messages_hash)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(block_index) DO UPDATE SET
      block_hash = excluded.block_hash, block_time = excluded.block_time,
      ledger_hash=excluded.ledger_hash,messages_hash=excluded.messages_hash
      WHERE block_hash != excluded.block_hash OR block_time != excluded.block_time
        OR ledger_hash IS NOT excluded.ledger_hash OR messages_hash IS NOT excluded.messages_hash`)
      .bind(block.block_index, block.block_hash, block.block_time,block.ledger_hash ?? null,block.messages_hash ?? null),
    db.prepare(`DELETE FROM indexer_block_checkpoints WHERE block_index < ? OR block_index > ?`)
      .bind(block.block_index - CHECKPOINT_RETENTION, block.block_index),
  ];
}

export async function findCommonCheckpoint(
  db: D1Database,
  tip: number,
  fetchBlock: (height: number) => Promise<BlockCheckpoint>,
  requireProtocol = false,
): Promise<BlockCheckpoint> {
  const rows = await db.prepare(`SELECT block_index, block_hash, block_time,ledger_hash,messages_hash
    FROM indexer_block_checkpoints WHERE block_index <= ? ORDER BY block_index DESC LIMIT ?`)
    .bind(tip, CHECKPOINT_RETENTION + 1).all<BlockCheckpoint>();
  for (const row of rows.results) {
    if (requireProtocol && (!row.ledger_hash || !row.messages_hash)) continue;
    if (sameBlockIdentity(row, await fetchBlock(row.block_index))) return row;
  }
  throw new Error("No verified common checkpoint in retained history; operator recovery required");
}
