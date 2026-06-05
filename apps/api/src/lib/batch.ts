/** Max statements per db.batch() call. D1 allows 100 bound params per statement. */
export const D1_BATCH_LIMIT = 50;

/** Execute prepared statements in batches to stay within D1 limits */
export async function batchExec(
  db: D1Database,
  stmts: D1PreparedStatement[],
  size: number = D1_BATCH_LIMIT
): Promise<D1Result[]> {
  const results: D1Result[] = [];
  for (let i = 0; i < stmts.length; i += size) {
    const batch = await db.batch(stmts.slice(i, i + size));
    results.push(...batch);
  }
  return results;
}
