// Historical Exchange PSBT listings remain readable. Trading mutations are retired.
import { Hono } from 'hono';

const LISTING_COLS = `id, seller_address, asset, asset_longname, asset_quantity,
  utxo_txid, utxo_vout, price_sats, status, broadcast_txid,
  buyer_address, tx_id, created_at, updated_at, expires_at`;

// ---------------------------------------------------------------------------
// GET /swaps — browse listings
// Query params: asset, seller, status (default "active"), sort, limit, offset
// ---------------------------------------------------------------------------
export async function handleGetSwaps(
  request: Request,
  db: D1Database
): Promise<Response> {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");
  const seller = url.searchParams.get("seller");
  const status = url.searchParams.get("status") ?? "active";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200
  );
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const sort = url.searchParams.get("sort") ?? "created_at_desc";

  // When querying "active", also include "pending_fill" so the UI can show them
  const conditions: string[] = [];
  if (status === "active") {
    conditions.push("status IN ('active', 'pending_fill')");
  } else {
    conditions.push("status = ?");
  }
  const params: (string | number)[] = status === "active" ? [] : [status];

  if (asset) {
    conditions.push("(asset = ? OR asset_longname = ?)");
    params.push(asset, asset);
  }
  if (seller) {
    conditions.push("seller_address = ?");
    params.push(seller);
  }
  if (status === "active") {
    conditions.push("(expires_at IS NULL OR expires_at > datetime('now'))");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const orderMap: Record<string, string> = {
    created_at_desc: "created_at DESC",
    created_at_asc: "created_at ASC",
    price_asc: "price_sats ASC",
    price_desc: "price_sats DESC",
  };
  const orderBy = orderMap[sort] ?? "created_at DESC";

  const countParams = [...params];
  const listParams = [...params, limit, offset];

  const [countResult, listings] = await db.batch([
    db.prepare(`SELECT COUNT(*) as cnt FROM swap_listings ${where}`).bind(...countParams),
    db
      .prepare(
        `SELECT ${LISTING_COLS}
         FROM swap_listings ${where}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`
      )
      .bind(...listParams),
  ]);

  const total = (countResult.results[0] as { cnt: number } | undefined)?.cnt ?? 0;

  return Response.json(
    { listings: listings.results, total, limit, offset },
    { headers: { "Cache-Control": "public, max-age=10" } }
  );
}

// ---------------------------------------------------------------------------
// GET /swaps/:id — single listing (no psbt_hex exposed)
// ---------------------------------------------------------------------------
export async function handleGetSwap(
  db: D1Database,
  id: string
): Promise<Response> {
  const listing = await db
    .prepare(`SELECT ${LISTING_COLS} FROM swap_listings WHERE id = ?`)
    .bind(id)
    .first();

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  return Response.json(listing, {
    headers: { "Cache-Control": "public, max-age=10" },
  });
}

/** Stable response for old clients; never parses/signs/broadcasts or touches the database. */
export function handleRetiredSwapMutation(): Response {
  return Response.json({ code: 'atomic_trading_retired', error: 'Atomic PSBT trading has been retired from Exchange. Use DigiRare Marketplace for PSBT trading.', marketplace_url: 'https://digirare.com/' }, { status: 410 });
}

export const retiredSwapRoutes = new Hono().post('*', () => handleRetiredSwapMutation());
