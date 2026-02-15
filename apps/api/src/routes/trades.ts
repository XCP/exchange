export async function handleTrades(
  request: Request,
  db: D1Database,
  pair: string
): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );
  const cursor = url.searchParams.get("cursor");

  let query = `SELECT id, block_time, price, amount, volume, side, maker, taker,
                      tx0_hash, tx1_hash
               FROM trades WHERE pair = ?`;
  const binds: (string | number)[] = [pair];

  if (cursor) {
    query += ` AND id < ?`;
    binds.push(parseInt(cursor, 10));
  }

  query += ` ORDER BY block_time DESC, id DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all<{
      id: number;
      block_time: number;
      price: number;
      amount: number;
      volume: number;
      side: string;
      maker: string;
      taker: string;
      tx0_hash: string;
      tx1_hash: string;
    }>();

  const trades = result.results.map((t) => ({
    t: t.block_time,
    price: t.price,
    amount: t.amount,
    volume: t.volume,
    side: t.side,
    maker: t.maker,
    taker: t.taker,
    tx0: t.tx0_hash,
    tx1: t.tx1_hash,
  }));

  const nextCursor =
    result.results.length === limit
      ? String(result.results[result.results.length - 1].id)
      : null;

  return Response.json(
    { pair, trades, next_cursor: nextCursor },
    {
      headers: {
        "Cache-Control": "no-cache",
      },
    }
  );
}
