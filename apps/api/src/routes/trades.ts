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

  let query = `SELECT id, block_time, price, amount, volume, side, maker, taker,
                      tx0_hash, tx1_hash, source_type, lp_asset, order_tx_hash
               FROM trades WHERE pair = ?`;
  const binds: (string | number)[] = [pair];

  if (cursor) {
    const [cursorTimeRaw, cursorIdRaw] = cursor.includes(":")
      ? cursor.split(":")
      : [null, cursor];
    const cursorId = parseInt(cursorIdRaw ?? "", 10);
    let cursorTime = cursorTimeRaw != null ? parseInt(cursorTimeRaw, 10) : NaN;

    if (!Number.isFinite(cursorId)) {
      return Response.json({ error: "Invalid cursor" }, { status: 400 });
    }

    if (!Number.isFinite(cursorTime)) {
      const cursorRow = await db
        .prepare(`SELECT block_time FROM trades WHERE pair = ? AND id = ?`)
        .bind(pair, cursorId)
        .first<{ block_time: number }>();
      if (!cursorRow) {
        return Response.json({ error: "Invalid cursor" }, { status: 400 });
      }
      cursorTime = cursorRow.block_time;
    }

    query += ` AND (block_time < ? OR (block_time = ? AND id < ?))`;
    binds.push(cursorTime, cursorTime, cursorId);
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
      ? `${result.results[result.results.length - 1].block_time}:${result.results[result.results.length - 1].id}`
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
