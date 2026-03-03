import { cacheControl } from "../utils/cache";

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
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
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
  } else {
    // Exclude invalid orders from unfiltered views
    conditions.push(`o.status != 'invalid'`);
  }

  if (asset) {
    const upper = asset.toUpperCase();
    const exactCheck = await db
      .prepare(`SELECT 1 FROM orders WHERE base_asset = ? OR quote_asset = ? LIMIT 1`)
      .bind(upper, upper)
      .first();
    if (exactCheck) {
      conditions.push(`(o.base_asset = ? OR o.quote_asset = ?)`);
      binds.push(upper, upper);
    } else {
      conditions.push(`(o.base_asset LIKE ? OR o.quote_asset LIKE ? OR ps.base_asset_longname LIKE ?)`);
      binds.push(`%${asset}%`, `%${asset}%`, `%${asset}%`);
    }
  }

  if (baseAsset) {
    const upper = baseAsset.toUpperCase();
    const exactCheck = await db
      .prepare(`SELECT 1 FROM orders WHERE base_asset = ? LIMIT 1`)
      .bind(upper)
      .first();
    if (exactCheck) {
      conditions.push(`o.base_asset = ?`);
      binds.push(upper);
    } else {
      conditions.push(`(o.base_asset LIKE ? OR ps.base_asset_longname LIKE ?)`);
      binds.push(`%${baseAsset}%`, `%${baseAsset}%`);
    }
  }

  if (quoteAsset) {
    const upper = quoteAsset.toUpperCase();
    const exactCheck = await db
      .prepare(`SELECT 1 FROM orders WHERE quote_asset = ? LIMIT 1`)
      .bind(upper)
      .first();
    if (exactCheck) {
      conditions.push(`o.quote_asset = ?`);
      binds.push(upper);
    } else {
      conditions.push(`o.quote_asset LIKE ?`);
      binds.push(`%${quoteAsset}%`);
    }
  }

  if (source) {
    conditions.push(`o.source = ?`);
    binds.push(source);
  }

  const side = url.searchParams.get("side");
  if (side === "buy" || side === "sell") {
    conditions.push(`o.side = ?`);
    binds.push(side === "buy" ? "bid" : "ask");
  }

  const includeHidden = url.searchParams.get("include_hidden");
  if (!includeHidden) {
    conditions.push(`(ps.hidden IS NULL OR ps.hidden = 0)`);
  }

  const tag = url.searchParams.get("tag");
  if (tag) {
    const tagType = url.searchParams.get("tag_type") ?? "collection";
    const tagRow = await db
      .prepare(`SELECT id FROM tags WHERE slug = ? AND tag_type = ?`)
      .bind(tag, tagType)
      .first<{ id: number }>();
    if (tagRow) {
      conditions.push(
        `(o.base_asset IN (SELECT asset FROM tag_assets WHERE tag_id = ?) OR o.quote_asset IN (SELECT asset FROM tag_assets WHERE tag_id = ?))`
      );
      binds.push(tagRow.id, tagRow.id);
    } else {
      return Response.json(
        { orders: [], total: 0, limit, offset },
        { headers: { "Cache-Control": cacheControl(url, 30) } }
      );
    }
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = sort === "expire_index:asc"
    ? ` ORDER BY o.expire_index ASC`
    : sort === "expire_index:desc"
      ? ` ORDER BY o.expire_index DESC`
      : sort === "price:asc"
        ? ` ORDER BY o.price ASC`
        : sort === "price:desc"
          ? ` ORDER BY o.price DESC`
          : ` ORDER BY o.block_index DESC`;

  const dataQuery = `SELECT ${columns} FROM orders o LEFT JOIN pair_stats ps ON o.pair = ps.pair${whereClause}${orderBy} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as total FROM orders o LEFT JOIN pair_stats ps ON o.pair = ps.pair${whereClause}`;

  const dataStmt = db.prepare(dataQuery).bind(...binds, limit, offset);
  const countStmt = binds.length > 0
    ? db.prepare(countQuery).bind(...binds)
    : db.prepare(countQuery);

  const [dataResult, countResult] = await db.batch([dataStmt, countStmt]);
  const total = (countResult.results[0] as { total: number })?.total ?? 0;

  return Response.json(
    { orders: dataResult.results, total, limit, offset },
    { headers: { "Cache-Control": cacheControl(url, 30) } }
  );
}
