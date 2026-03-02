import { setState } from "./state";

const TAGS_BASE = "https://app.xcp.io/api/v1/tags";
const PAGE_LIMIT = 100;
/** Max rows per INSERT statement (2 params each = 100 bound params at 50 rows) */
const ROWS_PER_STMT = 50;
/** Max statements per db.batch() call */
const STMTS_PER_BATCH = 50;

interface TagEntry {
  slug: string;
  name: string;
}

interface AssetEntry {
  asset: string;
}

export async function syncTags(db: D1Database, tagType: string): Promise<{ tags: number; assets: number }> {
  // 1. Fetch all tags of this type (paginated)
  const tags: TagEntry[] = [];
  let tagOffset = 0;

  while (true) {
    const res = await fetch(
      `${TAGS_BASE}?tag_type=${encodeURIComponent(tagType)}&limit=${PAGE_LIMIT}&offset=${tagOffset}`
    );
    if (!res.ok) throw new Error(`Tags API error: ${res.status}`);
    const data = await res.json<{ result: TagEntry[] }>();
    const page = data.result ?? [];
    for (const t of page) tags.push(t);
    if (page.length < PAGE_LIMIT) break;
    tagOffset += PAGE_LIMIT;
  }

  let totalAssets = 0;

  for (const tag of tags) {
    // 2. Fetch all assets for this tag (paginated)
    const assets: string[] = [];
    let offset = 0;

    while (true) {
      const res = await fetch(`${TAGS_BASE}/${tag.slug}/assets?limit=${PAGE_LIMIT}&offset=${offset}`);
      if (!res.ok) throw new Error(`Tag assets API error: ${res.status} for ${tag.slug}`);
      const data = await res.json<{ result: AssetEntry[] }>();
      const page = data.result ?? [];
      for (const a of page) assets.push(a.asset);
      if (page.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }

    // 3. Upsert tag + get id in a single query via RETURNING
    const row = await db
      .prepare(
        `INSERT INTO tags (slug, name, tag_type, assets_count)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (tag_type, slug) DO UPDATE SET name = excluded.name, assets_count = excluded.assets_count
         RETURNING id`
      )
      .bind(tag.slug, tag.name, tagType, assets.length)
      .first<{ id: number }>();

    if (!row) continue;
    const tagId = row.id;

    // 4. Check if tag_assets need re-sync (skip if count unchanged)
    const existing = await db
      .prepare(`SELECT COUNT(*) as cnt FROM tag_assets WHERE tag_id = ?`)
      .bind(tagId)
      .first<{ cnt: number }>();

    if ((existing?.cnt ?? 0) !== assets.length) {
      // Re-sync: delete old, multi-row batch insert new
      await db.prepare(`DELETE FROM tag_assets WHERE tag_id = ?`).bind(tagId).run();

      for (let i = 0; i < assets.length; i += ROWS_PER_STMT * STMTS_PER_BATCH) {
        const batchSlice = assets.slice(i, i + ROWS_PER_STMT * STMTS_PER_BATCH);
        const stmts: D1PreparedStatement[] = [];

        for (let j = 0; j < batchSlice.length; j += ROWS_PER_STMT) {
          const chunk = batchSlice.slice(j, j + ROWS_PER_STMT);
          const placeholders = chunk.map(() => "(?, ?)").join(", ");
          const params: (number | string)[] = [];
          for (const asset of chunk) {
            params.push(tagId, asset);
          }
          stmts.push(
            db.prepare(`INSERT INTO tag_assets (tag_id, asset) VALUES ${placeholders}`).bind(...params)
          );
        }

        await db.batch(stmts);
      }
    }

    totalAssets += assets.length;
  }

  // 5. Batch-update open orders + dispensers counts for all tags of this type (2 queries)
  await db.batch([
    db.prepare(
      `UPDATE tags SET open_orders_count = (
        SELECT COUNT(DISTINCT o.tx_hash) FROM orders o
        JOIN tag_assets ta ON ta.tag_id = tags.id
        WHERE o.status = 'open' AND (o.base_asset = ta.asset OR o.quote_asset = ta.asset)
      ) WHERE tag_type = ?`
    ).bind(tagType),
    db.prepare(
      `UPDATE tags SET open_dispensers_count = (
        SELECT COUNT(*) FROM dispensers d
        JOIN tag_assets ta ON ta.tag_id = tags.id
        WHERE d.status < 10 AND d.asset = ta.asset
      ) WHERE tag_type = ?`
    ).bind(tagType),
  ]);

  // 6. Record sync timestamp
  await setState(db, `last_tag_sync_${tagType}`, String(Math.floor(Date.now() / 1000)));

  return { tags: tags.length, assets: totalAssets };
}
