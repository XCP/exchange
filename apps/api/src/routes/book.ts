export async function handleBook(
  request: Request,
  db: D1Database,
  pair: string
): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );

  const bids = await db
    .prepare(
      `SELECT price, amount, remaining, give_remaining, get_remaining, source,
              block_index, block_time, tx_hash, expire_index
       FROM orders
       WHERE pair = ? AND status = 'open' AND side = 'bid'
       ORDER BY price DESC
       LIMIT ?`
    )
    .bind(pair, limit)
    .all();

  const asks = await db
    .prepare(
      `SELECT price, amount, remaining, give_remaining, get_remaining, source,
              block_index, block_time, tx_hash, expire_index
       FROM orders
       WHERE pair = ? AND status = 'open' AND side = 'ask'
       ORDER BY price ASC
       LIMIT ?`
    )
    .bind(pair, limit)
    .all();

  return Response.json(
    { pair, bids: bids.results, asks: asks.results },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
