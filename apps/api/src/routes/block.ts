export async function handleBlock(db: D1Database): Promise<Response> {
  const row = await db
    .prepare("SELECT value FROM indexer_state WHERE key = 'last_block_index'")
    .first<{ value: string }>();
  return Response.json(
    { block: row ? parseInt(row.value, 10) : null },
    { headers: { "Cache-Control": "public, max-age=10" } }
  );
}
