import { cacheControl } from "../utils/cache";

export async function handleDispensersLatest(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");
  const source = url.searchParams.get("source");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
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
  // "all" or null = no status filter

  if (asset) {
    conditions.push(`d.asset LIKE ?`);
    binds.push(`%${asset}%`);
  }

  if (source) {
    conditions.push(`d.source = ?`);
    binds.push(source);
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
        { dispensers: [] },
        { headers: { "Cache-Control": cacheControl(url, 30) } }
      );
    }
  }

  let query = `SELECT d.tx_hash, d.asset, d.source, d.give_quantity, d.escrow_quantity,
                      d.give_remaining, d.satoshi_price, d.price, d.dispense_count,
                      d.status, d.block_index, d.block_time
               FROM dispensers d`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }
  query += ` ORDER BY d.block_index DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all();

  return Response.json(
    { dispensers: result.results },
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
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (asset) {
    conditions.push(`e.asset LIKE ?`);
    binds.push(`%${asset}%`);
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
        { dispenses: [] },
        { headers: { "Cache-Control": cacheControl(url, 30) } }
      );
    }
  }

  let query = `SELECT e.tx_hash, e.dispense_index, e.dispenser_tx_hash,
                      e.source, e.destination, e.asset,
                      e.dispense_quantity, e.btc_amount, e.price,
                      e.block_index, e.block_time
               FROM dispenses e`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }
  query += ` ORDER BY e.block_index DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all();

  return Response.json(
    { dispenses: result.results },
    { headers: { "Cache-Control": cacheControl(url, 30) } }
  );
}
