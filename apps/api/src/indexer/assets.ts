/**
 * Indexes asset metadata from Counterparty API into the assets table.
 * Full paginated index on first run, incremental polling after.
 *
 * Source: https://api.counterparty.io:4000/v2/assets?verbose=true
 */

const CP_API_BASE = "https://api.counterparty.io:4000";
const PAGE_LIMIT = 1000;
const STOP_AFTER_KNOWN = 10; // Stop incremental after seeing this many known assets

interface CpAssetRow {
  asset: string;
  asset_longname: string | null;
  issuer: string | null;
  owner: string | null;
  divisible: boolean;
  locked: boolean;
  description_locked: boolean;
  supply_normalized: string; // API returns as string
  first_issuance_block_index: number;
}

interface CpAssetsResponse {
  result: CpAssetRow[];
  next_cursor: string | null;
  result_count: number;
}

async function fetchAssetsPage(cursor?: string): Promise<CpAssetsResponse> {
  const url = new URL(`${CP_API_BASE}/v2/assets`);
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);

  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`CP API ${resp.status}: ${await resp.text()}`);
  }
  return resp.json() as Promise<CpAssetsResponse>;
}

function upsertBatch(
  db: D1Database,
  assets: CpAssetRow[],
  now: number,
): D1PreparedStatement[] {
  return assets.map((a) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO assets (
           asset, asset_longname, issuer, owner, divisible, locked,
           description_locked, supply_normalized,
           first_issuance_block_index, updated_at
         ) VALUES (?,?,?,?,?,?, ?,?, ?,?)`,
      )
      .bind(
        a.asset,
        a.asset_longname,
        a.issuer,
        a.owner,
        a.divisible ? 1 : 0,
        a.locked ? 1 : 0,
        a.description_locked ? 1 : 0,
        parseFloat(a.supply_normalized) || 0,
        a.first_issuance_block_index,
        now,
      ),
  );
}

/**
 * Full paginated index of all assets. Use on first run.
 * Returns total assets indexed.
 */
export async function indexAllAssets(
  db: D1Database,
  maxPages: number = 500,
): Promise<{ indexed: number; pages: number }> {
  const now = Math.floor(Date.now() / 1000);
  let cursor: string | undefined;
  let totalIndexed = 0;
  let pages = 0;

  for (let page = 0; page < maxPages; page++) {
    const data = await fetchAssetsPage(cursor);
    if (data.result.length === 0) break;

    const stmts = upsertBatch(db, data.result, now);
    // D1 batch limit is ~100 statements, chunk if needed
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }

    totalIndexed += data.result.length;
    pages++;

    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return { indexed: totalIndexed, pages };
}

/**
 * Incremental sync — fetches newest assets first, stops after seeing
 * STOP_AFTER_KNOWN assets we already have. Designed for periodic polling.
 */
export async function syncNewAssets(
  db: D1Database,
  maxPages: number = 10,
): Promise<{ indexed: number; pages: number }> {
  const now = Math.floor(Date.now() / 1000);
  let cursor: string | undefined;
  let totalIndexed = 0;
  let pages = 0;

  for (let page = 0; page < maxPages; page++) {
    const data = await fetchAssetsPage(cursor);
    if (data.result.length === 0) break;

    // Check how many we already know
    const assetNames = data.result.map((a) => a.asset);
    const placeholders = assetNames.map((_, i) => `?${i + 1}`).join(",");
    const known = await db
      .prepare(`SELECT COUNT(*) as cnt FROM assets WHERE asset IN (${placeholders})`)
      .bind(...assetNames)
      .first<{ cnt: number }>();

    const knownCount = known?.cnt ?? 0;

    // Upsert all (updates supply etc. for known ones)
    const stmts = upsertBatch(db, data.result, now);
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }

    totalIndexed += data.result.length;
    pages++;

    // If most of this page was known, we've caught up
    if (knownCount >= STOP_AFTER_KNOWN) break;
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return { indexed: totalIndexed, pages };
}
