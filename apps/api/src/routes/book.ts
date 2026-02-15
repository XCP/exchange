export async function handleBook(
  request: Request,
  db: D1Database,
  pair: string
): Promise<Response> {
  const bids = await db
    .prepare(
      `SELECT price, amount, give_remaining, get_remaining, source,
              block_index, block_time, tx_hash, expire_index
       FROM orders
       WHERE pair = ? AND status = 'open' AND side = 'bid'
       ORDER BY price DESC
       LIMIT 50`
    )
    .bind(pair)
    .all();

  const asks = await db
    .prepare(
      `SELECT price, amount, give_remaining, get_remaining, source,
              block_index, block_time, tx_hash, expire_index
       FROM orders
       WHERE pair = ? AND status = 'open' AND side = 'ask'
       ORDER BY price ASC
       LIMIT 50`
    )
    .bind(pair)
    .all();

  return Response.json(
    { pair, bids: bids.results, asks: asks.results },
    {
      headers: {
        "Cache-Control": "public, max-age=10",
      },
    }
  );
}
