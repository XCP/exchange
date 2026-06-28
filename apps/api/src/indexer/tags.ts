import { setState } from "./state";

// app.xcp.io retired 2026-06: its curated collection tags were already synced into D1, and new
// collections come from the secondary sources below. syncTags() now refreshes counts from D1 only.
const TOKENSCAN_NFTS_URL = "https://tokenscan.io/js/nfts.js";
const PEPE_WTF_COLLECTIONS_URL = "https://api.pepe.wtf/api/collections";
const STAMPCHAIN_API_BASE = "https://stampchain.io/api/v2/stamps";
const SCANNABLE_NFTS_URL = "https://scannablenfts.com/api/scannables";
const KALEIDOSCOPE_URL = "http://kaleidoscopexcp.com/directory/kaleidoscope-directory.json";
/** Max rows per INSERT statement (2 params each = 100 bound params at 50 rows) */
const ROWS_PER_STMT = 50;
/** Max statements per db.batch() call */
const STMTS_PER_BATCH = 50;

/** Tokenscan name → our existing slug for known mismatches */
const TOKENSCAN_SLUG_OVERRIDES: Record<string, string> = {
  "Bitcorns": "bitcorn-crops",
};

/** pepe.wtf slug → our existing slug for known mismatches */
const PEPE_WTF_SLUG_OVERRIDES: Record<string, string> = {
  "fake-rares": "fake-rare",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface TokenscanCollection {
  name: string;
  site: string;
  cards: string[];
}

interface PepeWtfCollection {
  name: string;
  slug: string;
  assets: { name: string; platform: string }[];
}

/** Remove tag_assets rows that match entries in tag_asset_exclusions */
async function applyExclusions(db: D1Database): Promise<number> {
  const result = await db.prepare(
    `DELETE FROM tag_assets WHERE (tag_id, asset) IN (
       SELECT t.id, e.asset FROM tag_asset_exclusions e
       JOIN tags t ON t.slug = e.tag_slug
     )`
  ).run();
  return result.meta.changes ?? 0;
}

export async function syncTags(db: D1Database, tagType: string): Promise<{ tags: number; assets: number }> {
  // app.xcp.io (the former primary tag source) is retired. Its curated collection tags are already in
  // D1, and new collections arrive via the secondary sources (tokenscan/pepe.wtf/stampchain/…). This now
  // just refreshes derived counts + exclusions for tags of this type already present in D1 — no fetch.

  // Batch-update open orders + dispensers counts for all tags of this type (2 queries)
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

  // 6. Apply exclusions (remove assets that belong to a different collection)
  const excluded = await applyExclusions(db);
  if (excluded > 0) console.log(`tag sync: removed ${excluded} excluded tag_assets`);

  // Record sync timestamp
  await setState(db, `last_tag_sync_${tagType}`, String(Math.floor(Date.now() / 1000)));

  const cnt = await db
    .prepare(`SELECT COUNT(*) AS c FROM tags WHERE tag_type = ?`)
    .bind(tagType)
    .first<{ c: number }>();
  return { tags: cnt?.c ?? 0, assets: 0 };
}

/**
 * Sync NFT collections from tokenscan.io as a secondary source.
 * Uses INSERT ... ON CONFLICT DO NOTHING so xcp.io data stays authoritative.
 * Only inserts assets for newly created tags (skips if tag already existed).
 */
export async function syncTokenscanCollections(db: D1Database): Promise<{ tags: number; assets: number }> {
  const res = await fetch(TOKENSCAN_NFTS_URL);
  if (!res.ok) throw new Error(`Tokenscan fetch error: ${res.status}`);
  const text = await res.text();

  // File format: NFT_DATA = [ ... ]; — strip prefix and trailing semicolon
  const jsonStr = text.replace(/^[^=]+=\s*/, "").replace(/;\s*$/, "").trim();
  const collections: TokenscanCollection[] = JSON.parse(jsonStr);

  let newTags = 0;
  let totalAssets = 0;

  for (const col of collections) {
    const slug = TOKENSCAN_SLUG_OVERRIDES[col.name] ?? slugify(col.name);
    // Strip file extension from card filenames to get asset names
    const assets = col.cards.map((c) => c.replace(/\.[^.]+$/, ""));

    // INSERT ... ON CONFLICT DO NOTHING — xcp.io owns overlapping tags
    const row = await db
      .prepare(
        `INSERT INTO tags (slug, name, tag_type, assets_count)
         VALUES (?, ?, 'collection', ?)
         ON CONFLICT (tag_type, slug) DO NOTHING
         RETURNING id`
      )
      .bind(slug, col.name, assets.length)
      .first<{ id: number }>();

    // If row is null, the tag already existed — skip asset sync
    if (!row) continue;

    newTags++;
    const tagId = row.id;

    // Batch-insert assets respecting D1 limits
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

    totalAssets += assets.length;
  }

  // Update open orders + dispensers counts for any newly added tags
  if (newTags > 0) {
    await db.batch([
      db.prepare(
        `UPDATE tags SET open_orders_count = (
          SELECT COUNT(DISTINCT o.tx_hash) FROM orders o
          JOIN tag_assets ta ON ta.tag_id = tags.id
          WHERE o.status = 'open' AND (o.base_asset = ta.asset OR o.quote_asset = ta.asset)
        ) WHERE tag_type = 'collection' AND open_orders_count IS NULL`
      ),
      db.prepare(
        `UPDATE tags SET open_dispensers_count = (
          SELECT COUNT(*) FROM dispensers d
          JOIN tag_assets ta ON ta.tag_id = tags.id
          WHERE d.status < 10 AND d.asset = ta.asset
        ) WHERE tag_type = 'collection' AND open_dispensers_count IS NULL`
      ),
    ]);
  }

  await setState(db, "last_tag_sync_tokenscan", String(Math.floor(Date.now() / 1000)));

  return { tags: newTags, assets: totalAssets };
}

/**
 * Sync NFT collections from pepe.wtf as a secondary source.
 * Fetches /api/collections for the list, then /api/asset?collection={slug}
 * for each Counterparty collection's full asset list.
 * Uses INSERT ... ON CONFLICT DO NOTHING so xcp.io data stays authoritative.
 */
export async function syncPepeWtfCollections(db: D1Database): Promise<{ tags: number; assets: number }> {
  // 1. Get collection list (embedded assets are just a preview — we fetch full lists below)
  const listRes = await fetch(PEPE_WTF_COLLECTIONS_URL);
  if (!listRes.ok) throw new Error(`pepe.wtf collections list error: ${listRes.status}`);
  const collections: PepeWtfCollection[] = await listRes.json();

  // Filter to Counterparty collections using the embedded preview asset's platform
  const cpCollections = collections.filter((col) =>
    col.assets.some((a) => a.platform === "counterparty")
  );

  let newTags = 0;
  let totalAssets = 0;

  for (const col of cpCollections) {
    const slug = PEPE_WTF_SLUG_OVERRIDES[col.slug] ?? col.slug;

    // Check if tag already exists before fetching the full asset list
    const existing = await db
      .prepare(`SELECT id FROM tags WHERE tag_type = 'collection' AND slug = ?`)
      .bind(slug)
      .first<{ id: number }>();
    if (existing) continue;

    // 2. Fetch the full asset list for this collection
    const assetRes = await fetch(`https://api.pepe.wtf/api/asset?collection=${encodeURIComponent(col.slug)}`);
    if (!assetRes.ok) {
      console.error(`pepe.wtf asset fetch error for ${col.slug}: ${assetRes.status}`);
      continue;
    }
    const assetData: { name: string }[] = await assetRes.json();
    const assets = assetData.map((a) => a.name);

    if (assets.length === 0) continue;

    // 3. Insert the tag
    const row = await db
      .prepare(
        `INSERT INTO tags (slug, name, tag_type, assets_count)
         VALUES (?, ?, 'collection', ?)
         ON CONFLICT (tag_type, slug) DO NOTHING
         RETURNING id`
      )
      .bind(slug, col.name, assets.length)
      .first<{ id: number }>();

    if (!row) continue;

    newTags++;
    const tagId = row.id;

    // 4. Batch-insert assets respecting D1 limits
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

    totalAssets += assets.length;
    console.log(`pepe.wtf: inserted ${col.name} (${slug}) — ${assets.length} assets`);
  }

  // Update open orders + dispensers counts for any newly added tags
  if (newTags > 0) {
    await db.batch([
      db.prepare(
        `UPDATE tags SET open_orders_count = (
          SELECT COUNT(DISTINCT o.tx_hash) FROM orders o
          JOIN tag_assets ta ON ta.tag_id = tags.id
          WHERE o.status = 'open' AND (o.base_asset = ta.asset OR o.quote_asset = ta.asset)
        ) WHERE tag_type = 'collection' AND open_orders_count IS NULL`
      ),
      db.prepare(
        `UPDATE tags SET open_dispensers_count = (
          SELECT COUNT(*) FROM dispensers d
          JOIN tag_assets ta ON ta.tag_id = tags.id
          WHERE d.status < 10 AND d.asset = ta.asset
        ) WHERE tag_type = 'collection' AND open_dispensers_count IS NULL`
      ),
    ]);
  }

  await setState(db, "last_tag_sync_pepewtf", String(Math.floor(Date.now() / 1000)));

  return { tags: newTags, assets: totalAssets };
}

/**
 * Sync the "stamp-chain" collection from stampchain.io.
 * Paginates through /api/v2/stamps, extracts cpid (Counterparty asset name).
 * Uses INSERT ... ON CONFLICT DO NOTHING so existing sources stay authoritative.
 */
export async function syncStampchainCollection(db: D1Database): Promise<{ tags: number; assets: number }> {
  const slug = "stamp-chain";
  const name = "Stamp Chain";

  // Check if tag already exists — skip entire fetch if so
  const existing = await db
    .prepare(`SELECT id FROM tags WHERE tag_type = 'collection' AND slug = ?`)
    .bind(slug)
    .first<{ id: number }>();
  if (existing) return { tags: 0, assets: 0 };

  // Paginate through stampchain API to collect all cpid values
  const assets: string[] = [];
  let page = 1;
  let totalPages = 1;
  const limit = 500;

  while (page <= totalPages) {
    const res = await fetch(`${STAMPCHAIN_API_BASE}?page=${page}&limit=${limit}&sort_order=asc`);
    if (!res.ok) throw new Error(`stampchain.io fetch error: ${res.status} on page ${page}`);
    const data: { data: { cpid: string | null }[]; totalPages: number } = await res.json();
    totalPages = data.totalPages;

    for (const stamp of data.data) {
      if (stamp.cpid) assets.push(stamp.cpid);
    }

    page++;
  }

  if (assets.length === 0) return { tags: 0, assets: 0 };

  // Deduplicate (some stamps may share cpid)
  const uniqueAssets = [...new Set(assets)];

  // Insert the tag
  const row = await db
    .prepare(
      `INSERT INTO tags (slug, name, tag_type, assets_count)
       VALUES (?, ?, 'collection', ?)
       ON CONFLICT (tag_type, slug) DO NOTHING
       RETURNING id`
    )
    .bind(slug, name, uniqueAssets.length)
    .first<{ id: number }>();

  if (!row) return { tags: 0, assets: 0 };

  const tagId = row.id;

  // Batch-insert assets respecting D1 limits
  for (let i = 0; i < uniqueAssets.length; i += ROWS_PER_STMT * STMTS_PER_BATCH) {
    const batchSlice = uniqueAssets.slice(i, i + ROWS_PER_STMT * STMTS_PER_BATCH);
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

  // Update counts
  await db.batch([
    db.prepare(
      `UPDATE tags SET open_orders_count = (
        SELECT COUNT(DISTINCT o.tx_hash) FROM orders o
        JOIN tag_assets ta ON ta.tag_id = tags.id
        WHERE o.status = 'open' AND (o.base_asset = ta.asset OR o.quote_asset = ta.asset)
      ) WHERE id = ?`
    ).bind(tagId),
    db.prepare(
      `UPDATE tags SET open_dispensers_count = (
        SELECT COUNT(*) FROM dispensers d
        JOIN tag_assets ta ON ta.tag_id = tags.id
        WHERE d.status < 10 AND d.asset = ta.asset
      ) WHERE id = ?`
    ).bind(tagId),
  ]);

  await setState(db, "last_tag_sync_stampchain", String(Math.floor(Date.now() / 1000)));

  console.log(`stampchain: inserted ${name} (${slug}) — ${uniqueAssets.length} assets`);
  return { tags: 1, assets: uniqueAssets.length };
}

/**
 * Helper: sync a single collection from a simple JSON endpoint.
 * Fetches the URL, extracts asset names via the assetKey, inserts with ON CONFLICT DO NOTHING.
 */
async function syncSimpleCollection(
  db: D1Database,
  url: string,
  slug: string,
  name: string,
  assetKey: string,
  stateKey: string,
): Promise<{ tags: number; assets: number }> {
  // Check if tag already exists
  const existing = await db
    .prepare(`SELECT id FROM tags WHERE tag_type = 'collection' AND slug = ?`)
    .bind(slug)
    .first<{ id: number }>();
  if (existing) return { tags: 0, assets: 0 };

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} fetch error: ${res.status}`);
  const data: Record<string, string>[] = await res.json();
  const assets = [...new Set(data.map((item) => item[assetKey]).filter(Boolean))];

  if (assets.length === 0) return { tags: 0, assets: 0 };

  const row = await db
    .prepare(
      `INSERT INTO tags (slug, name, tag_type, assets_count)
       VALUES (?, ?, 'collection', ?)
       ON CONFLICT (tag_type, slug) DO NOTHING
       RETURNING id`
    )
    .bind(slug, name, assets.length)
    .first<{ id: number }>();

  if (!row) return { tags: 0, assets: 0 };

  const tagId = row.id;

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

  await db.batch([
    db.prepare(
      `UPDATE tags SET open_orders_count = (
        SELECT COUNT(DISTINCT o.tx_hash) FROM orders o
        JOIN tag_assets ta ON ta.tag_id = tags.id
        WHERE o.status = 'open' AND (o.base_asset = ta.asset OR o.quote_asset = ta.asset)
      ) WHERE id = ?`
    ).bind(tagId),
    db.prepare(
      `UPDATE tags SET open_dispensers_count = (
        SELECT COUNT(*) FROM dispensers d
        JOIN tag_assets ta ON ta.tag_id = tags.id
        WHERE d.status < 10 AND d.asset = ta.asset
      ) WHERE id = ?`
    ).bind(tagId),
  ]);

  await setState(db, stateKey, String(Math.floor(Date.now() / 1000)));

  console.log(`${name}: inserted (${slug}) — ${assets.length} assets`);
  return { tags: 1, assets: assets.length };
}

/** Sync Scannable NFTs collection from scannablenfts.com */
export async function syncScannableNfts(db: D1Database): Promise<{ tags: number; assets: number }> {
  return syncSimpleCollection(db, SCANNABLE_NFTS_URL, "scannable-nfts", "Scannable NFTs", "asset", "last_tag_sync_scannable");
}

/** Sync Kaleidoscope collection from kaleidoscopexcp.com */
export async function syncKaleidoscope(db: D1Database): Promise<{ tags: number; assets: number }> {
  return syncSimpleCollection(db, KALEIDOSCOPE_URL, "kaleidoscope", "Kaleidoscope", "asset_name", "last_tag_sync_kaleidoscope");
}
