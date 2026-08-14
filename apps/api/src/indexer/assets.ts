/**
 * Indexes asset metadata from Counterparty API into the assets table.
 * Full paginated index on first run, incremental polling after.
 *
 * Source: https://api.counterparty.io:4000/v2/assets?verbose=true
 *
 * Resumable: persists cursor in indexer_state so each invocation picks up
 * where it left off. Safe to call repeatedly until done=true.
 */

const CP_API_BASE = "https://api.counterparty.io:4000";
const PAGE_LIMIT = 1000;
const STOP_AFTER_KNOWN = 10; // Stop incremental after seeing this many known assets
const DELAY_MS = 200; // Delay between pages to avoid rate limits

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function getCursor(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM indexer_state WHERE key = 'asset_sync_cursor'`)
    .first<{ value: string }>();
  if (!row?.value) return null;
  // Ensure integer string (CP API rejects floats like "227643.0")
  return String(Math.floor(Number(row.value)));
}

async function saveCursor(db: D1Database, cursor: string | null): Promise<void> {
  if (cursor) {
    await db
      .prepare(`INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('asset_sync_cursor', ?)`)
      .bind(cursor)
      .run();
  } else {
    await db
      .prepare(`DELETE FROM indexer_state WHERE key = 'asset_sync_cursor'`)
      .run();
  }
}

/**
 * Resumable full index. Persists cursor between calls so you can invoke
 * repeatedly with small page counts to avoid timeouts and rate limits.
 *
 * Returns done=true when the full catalog has been indexed.
 * Call with reset=true to start over from the beginning.
 */
export async function indexAllAssets(
  db: D1Database,
  maxPages: number = 20,
  reset: boolean = false,
): Promise<{ indexed: number; pages: number; done: boolean; cursor: string | null }> {
  const now = Math.floor(Date.now() / 1000);

  if (reset) {
    await saveCursor(db, null);
  }

  let cursor = await getCursor(db);
  let totalIndexed = 0;
  let pages = 0;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await delay(DELAY_MS);

    const data = await fetchAssetsPage(cursor ?? undefined);
    if (data.result.length === 0) {
      // Done — clear cursor
      await saveCursor(db, null);
      return { indexed: totalIndexed, pages, done: true, cursor: null };
    }

    const stmts = upsertBatch(db, data.result, now);
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }

    totalIndexed += data.result.length;
    pages++;

    if (!data.next_cursor) {
      await saveCursor(db, null);
      return { indexed: totalIndexed, pages, done: true, cursor: null };
    }

    // CP API returns cursor as float sometimes — ensure integer string
    cursor = String(Math.floor(Number(data.next_cursor)));
    await saveCursor(db, cursor);
  }

  // Ran out of pages budget — save cursor for next call
  return { indexed: totalIndexed, pages, done: false, cursor };
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
    if (page > 0) await delay(DELAY_MS);

    const data = await fetchAssetsPage(cursor);
    if (data.result.length === 0) break;

    // Check which of this page we already know
    const assetNames = data.result.map((a) => a.asset);
    const placeholders = assetNames.map((_, i) => `?${i + 1}`).join(",");
    const known = await db
      .prepare(`SELECT asset FROM assets WHERE asset IN (${placeholders})`)
      .bind(...assetNames)
      .all<{ asset: string }>();
    const knownSet = new Set(known.results.map((r) => r.asset));
    const knownCount = knownSet.size;

    // Upsert only unknown assets. Re-upserting known rows rewrote a full page
    // (~1000 rows) every cron tick for nothing — and it never actually tracked
    // supply: reissued assets don't reappear on the first page, so only the
    // newest page ever got refreshed. Supply refresh belongs to a full re-index.
    const newAssets = data.result.filter((a) => !knownSet.has(a.asset));
    const stmts = upsertBatch(db, newAssets, now);
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }

    totalIndexed += newAssets.length;
    pages++;

    // If most of this page was known, we've caught up
    if (knownCount >= STOP_AFTER_KNOWN) break;
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return { indexed: totalIndexed, pages };
}
