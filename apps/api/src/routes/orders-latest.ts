export async function handleOrdersLatest(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const asset = url.searchParams.get("asset");
  const baseAsset = url.searchParams.get("base_asset");
  const quoteAsset = url.searchParams.get("quote_asset");
  const source = url.searchParams.get("source");
  const sort = url.searchParams.get("sort") ?? "block_index:desc";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "250", 10) || 250,
    500
  );

  const validStatuses = ["open", "filled", "expired", "cancelled", "invalid"];
  if (status && !validStatuses.includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const columns = `o.tx_hash, o.pair, o.base_asset, o.quote_asset, o.source, o.side, o.price, o.amount,
                    o.give_quantity, o.get_quantity, o.give_remaining, o.get_remaining, o.remaining,
                    o.expire_index, o.block_index, o.block_time, o.status,
                    ps.base_asset_longname, ps.quote_asset_longname`;

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (status) {
    conditions.push(`o.status = ?`);
    binds.push(status);
  }

  if (asset) {
    conditions.push(`(o.base_asset LIKE ? OR o.quote_asset LIKE ? OR ps.base_asset_longname LIKE ?)`);
    binds.push(`%${asset}%`, `%${asset}%`, `%${asset}%`);
  }

  if (baseAsset) {
    conditions.push(`(o.base_asset LIKE ? OR ps.base_asset_longname LIKE ?)`);
    binds.push(`%${baseAsset}%`, `%${baseAsset}%`);
  }

  if (quoteAsset) {
    conditions.push(`o.quote_asset LIKE ?`);
    binds.push(`%${quoteAsset}%`);
  }

  if (source) {
    conditions.push(`o.source = ?`);
    binds.push(source);
  }

  let query = `SELECT ${columns} FROM orders o LEFT JOIN pair_stats ps ON o.pair = ps.pair`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  if (sort === "expire_index:asc") {
    query += ` ORDER BY o.expire_index ASC`;
  } else if (sort === "expire_index:desc") {
    query += ` ORDER BY o.expire_index DESC`;
  } else {
    query += ` ORDER BY o.block_index DESC`;
  }

  query += ` LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all();

  return Response.json(
    { orders: result.results },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}
