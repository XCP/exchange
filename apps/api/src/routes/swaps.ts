// PSBT-based atomic swap listings
// Server-mediated: seller's signed PSBT is never exposed to buyers.
// Cancel is a free DB update (no on-chain tx needed).

import { mergeAndFinalize, broadcastTx } from "../lib/psbt";

const LISTING_COLS = `id, seller_address, asset, asset_longname, asset_quantity,
  utxo_txid, utxo_vout, price_sats, status,
  buyer_address, tx_id, created_at, updated_at, expires_at`;

// ---------------------------------------------------------------------------
// POST /swaps — seller creates a new listing
// ---------------------------------------------------------------------------
export async function handleCreateSwap(
  request: Request,
  db: D1Database
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const seller_address = String(body.seller_address ?? "");
  const asset = String(body.asset ?? "");
  const asset_longname = body.asset_longname ? String(body.asset_longname) : null;
  const asset_quantity = Number(body.asset_quantity);
  const utxo_txid = String(body.utxo_txid ?? "");
  const utxo_vout = Number(body.utxo_vout);
  const price_sats = Number(body.price_sats);
  const psbt_hex = String(body.psbt_hex ?? "");
  const expires_at = body.expires_at ? String(body.expires_at) : null;

  // Validate required fields
  const errors: string[] = [];
  if (!seller_address) errors.push("seller_address is required");
  if (!asset) errors.push("asset is required");
  if (!Number.isInteger(asset_quantity) || asset_quantity <= 0)
    errors.push("asset_quantity must be a positive integer");
  if (!/^[0-9a-f]{64}$/i.test(utxo_txid))
    errors.push("utxo_txid must be a 64-char hex string");
  if (!Number.isInteger(utxo_vout) || utxo_vout < 0)
    errors.push("utxo_vout must be a non-negative integer");
  if (!Number.isInteger(price_sats) || price_sats <= 0)
    errors.push("price_sats must be a positive integer");
  if (!psbt_hex || !/^[0-9a-f]+$/i.test(psbt_hex))
    errors.push("psbt_hex must be a non-empty hex string");

  if (errors.length > 0) {
    return Response.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO swap_listings
           (id, seller_address, asset, asset_longname, asset_quantity,
            utxo_txid, utxo_vout, price_sats, psbt_hex, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, seller_address, asset, asset_longname, asset_quantity,
            utxo_txid, utxo_vout, price_sats, psbt_hex, expires_at)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("UNIQUE constraint")) {
      return Response.json(
        { error: "An active listing already exists for this UTXO" },
        { status: 409 }
      );
    }
    throw e;
  }

  return Response.json(
    {
      id,
      seller_address,
      asset,
      asset_longname,
      asset_quantity,
      utxo_txid,
      utxo_vout,
      price_sats,
      status: "active",
      created_at: new Date().toISOString(),
    },
    { status: 201 }
  );
}

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

  const conditions: string[] = ["status = ?"];
  const params: (string | number)[] = [status];

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

// ---------------------------------------------------------------------------
// POST /swaps/:id/cancel — seller cancels (free, DB-only)
// ---------------------------------------------------------------------------
export async function handleCancelSwap(
  request: Request,
  db: D1Database,
  id: string
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const seller_address = String(body.seller_address ?? "");
  if (!seller_address) {
    return Response.json({ error: "seller_address is required" }, { status: 400 });
  }

  const result = await db
    .prepare(
      `UPDATE swap_listings
       SET status = 'cancelled', updated_at = datetime('now')
       WHERE id = ? AND seller_address = ? AND status = 'active'`
    )
    .bind(id, seller_address)
    .run();

  if (result.meta.changes === 0) {
    return Response.json(
      { error: "Listing not found, not active, or not owned by this address" },
      { status: 404 }
    );
  }

  return Response.json({ ok: true, id, status: "cancelled" });
}

// ---------------------------------------------------------------------------
// POST /swaps/:id/fill — buyer submits signed PSBT
//
// Flow:
//   1. Validate listing is active & not expired
//   2. Record fill attempt (swap_fills)
//   3. Mark listing as pending_fill
//   4. TODO: merge seller + buyer PSBTs → finalize → broadcast
// ---------------------------------------------------------------------------
export async function handleFillSwap(
  request: Request,
  db: D1Database,
  id: string
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const buyer_address = String(body.buyer_address ?? "");
  const psbt_hex = String(body.psbt_hex ?? "");

  if (!buyer_address) {
    return Response.json({ error: "buyer_address is required" }, { status: 400 });
  }
  if (!psbt_hex || !/^[0-9a-f]+$/i.test(psbt_hex)) {
    return Response.json({ error: "psbt_hex must be a non-empty hex string" }, { status: 400 });
  }

  // Load listing (including psbt_hex + UTXO info for merge)
  const listing = await db
    .prepare(
      `SELECT id, seller_address, psbt_hex, utxo_txid, utxo_vout, price_sats, status, expires_at
       FROM swap_listings WHERE id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      seller_address: string;
      psbt_hex: string;
      utxo_txid: string;
      utxo_vout: number;
      price_sats: number;
      status: string;
      expires_at: string | null;
    }>();

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  if (listing.status !== "active") {
    return Response.json(
      { error: `Listing is not active (status: ${listing.status})` },
      { status: 409 }
    );
  }

  // Check expiry
  if (listing.expires_at && new Date(listing.expires_at) < new Date()) {
    await db
      .prepare(
        `UPDATE swap_listings SET status = 'expired', updated_at = datetime('now')
         WHERE id = ? AND status = 'active'`
      )
      .bind(id)
      .run();
    return Response.json({ error: "Listing has expired" }, { status: 410 });
  }

  // Prevent self-fill
  if (buyer_address === listing.seller_address) {
    return Response.json({ error: "Cannot fill your own listing" }, { status: 400 });
  }

  // Merge seller's signature into buyer's PSBT, finalize, and broadcast
  let rawTxHex: string;
  try {
    rawTxHex = mergeAndFinalize(
      listing.psbt_hex,
      psbt_hex,
      listing.utxo_txid,
      listing.utxo_vout
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Revert listing if merge fails — it stays active for another buyer
    return Response.json(
      { error: "PSBT merge failed", details: msg },
      { status: 422 }
    );
  }

  let txId: string;
  try {
    txId = await broadcastTx(rawTxHex);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "Broadcast failed", details: msg },
      { status: 502 }
    );
  }

  // Success — record the fill and mark listing as filled
  const fillId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO swap_fills (id, swap_listing_id, buyer_address, tx_id, status)
         VALUES (?, ?, ?, ?, 'confirmed')`
      )
      .bind(fillId, id, buyer_address, txId),
    db
      .prepare(
        `UPDATE swap_listings
         SET status = 'filled', buyer_address = ?, tx_id = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'active'`
      )
      .bind(buyer_address, txId, id),
  ]);

  return Response.json({
    fill_id: fillId,
    swap_listing_id: id,
    buyer_address,
    tx_id: txId,
    status: "filled",
  });
}
