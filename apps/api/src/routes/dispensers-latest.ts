import { cacheControl } from "../utils/cache";

export async function handleDispensersLatest(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");
  const source = url.searchParams.get("source");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "250", 10) || 250,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const status = url.searchParams.get("status");
  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (status === "open") {
    conditions.push(`d.status < 10`);
  } else if (status === "closing") {
    conditions.push(`d.status = 11`);
  } else if (status === "closed") {
    conditions.push(`d.status = 10`);
  }

  if (asset) {
    const upper = asset.toUpperCase();
    // Check for exact match first; fall back to fuzzy
    const exactCheck = await db
      .prepare(`SELECT 1 FROM dispensers WHERE asset = ? LIMIT 1`)
      .bind(upper)
      .first();
    if (exactCheck) {
      conditions.push(`d.asset = ?`);
      binds.push(upper);
    } else {
      conditions.push(`d.asset LIKE ?`);
      binds.push(`%${asset}%`);
    }
  }

  if (source) {
    conditions.push(`d.source = ?`);
    binds.push(source);
  }

  const includeHidden = url.searchParams.get("include_hidden");
  if (!includeHidden) {
    conditions.push(
      `d.asset NOT IN (SELECT asset FROM dispenser_stats WHERE hidden = 1)`
    );
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
        `d.asset IN (SELECT asset FROM tag_assets WHERE tag_id = ?)`
      );
      binds.push(tagRow.id);
    } else {
      return Response.json(
        { dispensers: [], total: 0, limit, offset },
        { headers: { "Cache-Control": cacheControl(url, 30) } }
      );
    }
  }

  const columns = `d.tx_hash, d.asset, d.source, d.give_quantity, d.escrow_quantity,
                      d.give_remaining, d.satoshi_price, d.price, d.dispense_count,
                      d.status, d.block_index, d.block_time`;
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  const sort = url.searchParams.get("sort");
  let orderClause = "ORDER BY d.block_index DESC";
  if (sort === "price") orderClause = "ORDER BY d.price ASC";
  else if (sort === "price_desc") orderClause = "ORDER BY d.price DESC";
  else if (sort === "dispenses") orderClause = "ORDER BY d.dispense_count DESC";
  else if (sort === "time") orderClause = "ORDER BY d.block_index ASC";
  else if (sort === "time_desc") orderClause = "ORDER BY d.block_index DESC";

  const dataQuery = `SELECT ${columns} FROM dispensers d${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as total FROM dispensers d${whereClause}`;

  const dataStmt = db.prepare(dataQuery).bind(...binds, limit, offset);
  const countStmt = binds.length > 0
    ? db.prepare(countQuery).bind(...binds)
    : db.prepare(countQuery);

  const [dataResult, countResult] = await db.batch([dataStmt, countStmt]);
  const total = (countResult.results[0] as { total: number })?.total ?? 0;

  return Response.json(
    { dispensers: dataResult.results, total, limit, offset },
    { headers: { "Cache-Control": cacheControl(url, 30) } }
  );
}

export async function handleDispensesLatest(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "250", 10) || 250,
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  const includeHiddenDispenses = url.searchParams.get("include_hidden");
  if (!includeHiddenDispenses) {
    conditions.push(
      `e.asset NOT IN (SELECT asset FROM dispenser_stats WHERE hidden = 1)`
    );
  }

  if (asset) {
    const upper = asset.toUpperCase();
    const exactCheck = await db
      .prepare(`SELECT 1 FROM dispenses WHERE asset = ? LIMIT 1`)
      .bind(upper)
      .first();
    if (exactCheck) {
      conditions.push(`e.asset = ?`);
      binds.push(upper);
    } else {
      conditions.push(`e.asset LIKE ?`);
      binds.push(`%${asset}%`);
    }
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
        `e.asset IN (SELECT asset FROM tag_assets WHERE tag_id = ?)`
      );
      binds.push(tagRow.id);
    } else {
      return Response.json(
        { dispenses: [], total: 0, limit, offset },
        { headers: { "Cache-Control": cacheControl(url, 30) } }
      );
    }
  }

  const columns = `e.tx_hash, e.dispense_index, e.dispenser_tx_hash,
                      e.source, e.destination, e.asset,
                      e.dispense_quantity, e.btc_amount, e.price,
                      e.block_index, e.block_time`;
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  const sort = url.searchParams.get("sort");
  let orderClause = "ORDER BY e.block_index DESC";
  if (sort === "price") orderClause = "ORDER BY e.price ASC";
  else if (sort === "price_desc") orderClause = "ORDER BY e.price DESC";
  else if (sort === "time") orderClause = "ORDER BY e.block_index ASC";
  else if (sort === "time_desc") orderClause = "ORDER BY e.block_index DESC";

  const dataQuery = `SELECT ${columns} FROM dispenses e${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as total FROM dispenses e${whereClause}`;

  const dataStmt = db.prepare(dataQuery).bind(...binds, limit, offset);
  const countStmt = binds.length > 0
    ? db.prepare(countQuery).bind(...binds)
    : db.prepare(countQuery);

  const [dataResult, countResult] = await db.batch([dataStmt, countStmt]);
  const total = (countResult.results[0] as { total: number })?.total ?? 0;

  return Response.json(
    { dispenses: dataResult.results, total, limit, offset },
    { headers: { "Cache-Control": cacheControl(url, 30) } }
  );
}
