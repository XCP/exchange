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

  const columns = `d.tx_hash, d.asset, ds_ln.asset_longname, d.source, d.give_quantity, d.escrow_quantity,
                      d.give_remaining, d.satoshi_price, d.price, d.dispense_count,
                      d.status, d.block_index, d.block_time,
                      dtag.slug AS collection_slug, dtag.name AS collection_name`;
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = ` LEFT JOIN dispenser_stats ds_ln ON d.asset = ds_ln.asset LEFT JOIN tag_assets dta ON d.asset = dta.asset LEFT JOIN tags dtag ON dta.tag_id = dtag.id AND dtag.tag_type = 'collection'`;

  const sort = url.searchParams.get("sort");
  let orderClause = "ORDER BY d.block_index DESC";
  if (sort === "price") orderClause = "ORDER BY d.price ASC";
  else if (sort === "price_desc") orderClause = "ORDER BY d.price DESC";
  else if (sort === "dispenses") orderClause = "ORDER BY d.dispense_count DESC";
  else if (sort === "time") orderClause = "ORDER BY d.block_index ASC";
  else if (sort === "time_desc") orderClause = "ORDER BY d.block_index DESC";

  const dataQuery = `SELECT ${columns} FROM dispensers d${joinClause}${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as total FROM dispensers d${whereClause}`;

  const dataStmt = db.prepare(dataQuery).bind(...binds, limit, offset);

  // `count=0` opts out of the exact total, the same trade as /orders/latest.
  //
  // Smaller than its sibling below -- dispensers holds ~18,000 rows, not the
  // whole dispense ledger -- but the homepage card discards this total too,
  // and a count nobody reads is worth nothing at any size.
  const wantTotal = url.searchParams.get("count") !== "0";

  let dataResult: D1Result;
  let total: number | null = null;

  if (wantTotal) {
    const countStmt = binds.length > 0
      ? db.prepare(countQuery).bind(...binds)
      : db.prepare(countQuery);
    const [data, countResult] = await db.batch([dataStmt, countStmt]);
    dataResult = data;
    total = (countResult.results[0] as { total: number })?.total ?? 0;
  } else {
    dataResult = await dataStmt.all();
  }

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

  const conditions: string[] = ["e.dispense_quantity > 0"];
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
                      e.source, e.destination, e.asset, ds_ln.asset_longname,
                      e.dispense_quantity, e.btc_amount, e.price,
                      e.block_index, e.block_time,
                      etag.slug AS collection_slug, etag.name AS collection_name`;
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = ` LEFT JOIN dispenser_stats ds_ln ON e.asset = ds_ln.asset LEFT JOIN tag_assets eta ON e.asset = eta.asset LEFT JOIN tags etag ON eta.tag_id = etag.id AND etag.tag_type = 'collection'`;

  const sort = url.searchParams.get("sort");
  let orderClause = "ORDER BY e.block_index DESC";
  if (sort === "price") orderClause = "ORDER BY e.price ASC";
  else if (sort === "price_desc") orderClause = "ORDER BY e.price DESC";
  else if (sort === "time") orderClause = "ORDER BY e.block_index ASC";
  else if (sort === "time_desc") orderClause = "ORDER BY e.block_index DESC";

  const dataQuery = `SELECT ${columns} FROM dispenses e${joinClause}${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as total FROM dispenses e${whereClause}`;

  const dataStmt = db.prepare(dataQuery).bind(...binds, limit, offset);

  // `count=0` opts out of the exact total, the same trade as /orders/latest.
  //
  // COUNT(*) here is O(matching rows) and no index removes that: every dispense
  // with a quantity, filtered through the hidden-asset subquery, measured at
  // 414,659 rows a run to produce a single number.
  //
  // The homepage's Recent Activity card asks for four rows and renders no
  // pagination, so it was paying all of that for a total it destructs away.
  // /explore/dispensers does page and still needs it, so the exact count stays
  // the default and the caller that does not want it says so.
  const wantTotal = url.searchParams.get("count") !== "0";

  let dataResult: D1Result;
  let total: number | null = null;

  if (wantTotal) {
    const countStmt = binds.length > 0
      ? db.prepare(countQuery).bind(...binds)
      : db.prepare(countQuery);
    const [data, countResult] = await db.batch([dataStmt, countStmt]);
    dataResult = data;
    total = (countResult.results[0] as { total: number })?.total ?? 0;
  } else {
    dataResult = await dataStmt.all();
  }

  return Response.json(
    { dispenses: dataResult.results, total, limit, offset },
    { headers: { "Cache-Control": cacheControl(url, 30) } }
  );
}
