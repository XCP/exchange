import { cacheControl } from "../utils/cache";

export async function handleTrades(
  request: Request,
  db: D1Database,
  pair: string
): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    500
  );
  const cursor = url.searchParams.get("cursor");

  // Uses idx_trades_pair_id index: (pair, id DESC)
  // id is monotonically increasing with block_time, so ORDER BY id DESC
  // is equivalent to chronological DESC and enables efficient cursor scan.
  let query = `SELECT id, block_time, price, amount, volume, side, maker, taker,
                      tx0_hash, tx1_hash, source_type, lp_asset, order_tx_hash
               FROM trades WHERE pair = ?`;
  const binds: (string | number)[] = [pair];

  if (cursor) {
    const cursorId = parseInt(cursor, 10);
    if (!Number.isFinite(cursorId)) {
      return Response.json({ error: "Invalid cursor" }, { status: 400 });
    }
    query += ` AND id < ?`;
    binds.push(cursorId);
  }

  query += ` ORDER BY id DESC LIMIT ?`;
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
      source_type: string;
      lp_asset: string | null;
      order_tx_hash: string | null;
    }>();

  const trades = result.results.map((t) => ({
    id: t.id,
    t: t.block_time,
    price: t.price,
    amount: t.amount,
    volume: t.volume,
    side: t.side,
    maker: t.maker,
    taker: t.taker,
    tx0: t.tx0_hash,
    tx1: t.tx1_hash,
    source_type: t.source_type,
    lp_asset: t.lp_asset,
    order_tx_hash: t.order_tx_hash,
  }));

  const nextCursor =
    result.results.length === limit
      ? String(result.results[result.results.length - 1].id)
      : null;

  return Response.json(
    { pair, trades, next_cursor: nextCursor },
    {
      headers: {
        "Cache-Control": cacheControl(url, 60),
      },
    }
  );
}
