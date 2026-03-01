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

  const columns = `tx_hash, pair, base_asset, quote_asset, source, side, price, amount,
                    give_quantity, get_quantity, give_remaining, get_remaining, remaining,
                    expire_index, block_index, block_time, status`;

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (status) {
    conditions.push(`status = ?`);
    binds.push(status);
  }

  if (asset) {
    conditions.push(`(base_asset LIKE ? OR quote_asset LIKE ?)`);
    binds.push(`%${asset}%`, `%${asset}%`);
  }

  if (baseAsset) {
    conditions.push(`base_asset LIKE ?`);
    binds.push(`%${baseAsset}%`);
  }

  if (quoteAsset) {
    conditions.push(`quote_asset LIKE ?`);
    binds.push(`%${quoteAsset}%`);
  }

  if (source) {
    conditions.push(`source = ?`);
    binds.push(source);
  }

  let query = `SELECT ${columns} FROM orders`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  if (sort === "expire_index:asc") {
    query += ` ORDER BY expire_index ASC`;
  } else if (sort === "expire_index:desc") {
    query += ` ORDER BY expire_index DESC`;
  } else {
    query += ` ORDER BY block_index DESC`;
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
