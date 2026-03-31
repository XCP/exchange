export async function handleAssetTags(request: Request, db: D1Database, asset: string): Promise<Response> {
  const rows = await db
    .prepare(
      `SELECT t.slug, t.name, t.tag_type FROM tag_assets ta JOIN tags t ON ta.tag_id = t.id WHERE ta.asset = ? ORDER BY t.tag_type`
    )
    .bind(asset.toUpperCase())
    .all();
  return Response.json(
    { tags: rows.results },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}

export async function handleTags(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const tagType = url.searchParams.get("type") ?? "collection";

  const rows = await db
    .prepare(
      `SELECT slug, name, tag_type, assets_count, open_orders_count, open_dispensers_count
       FROM tags WHERE tag_type = ? ORDER BY name`
    )
    .bind(tagType)
    .all();
  return Response.json(
    { tags: rows.results },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
