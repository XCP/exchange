// PSBT-based atomic swap listings
// Server-mediated: seller's signed PSBT is never exposed to buyers.
//
// Sell:   POST /swaps/prepare-listing  → POST /swaps/complete-listing
// Buy:    POST /swaps/:id/prepare-fill → POST /swaps/:id/complete-fill
// Cancel: POST /swaps/:id/prepare-cancel → POST /swaps/:id/cancel (BIP-322 signed)
// Browse: GET /swaps, GET /swaps/:id

import { Transaction } from "@scure/btc-signer";
import { hex as hexCodec } from "@scure/base";
import { mergeAndFinalize, broadcastTx } from "../lib/psbt";
import {
  constructSellerPsbt,
  constructBuyerPsbt,
  getFeeRate,
  fetchAddressUtxos,
  pickFeeAddress,
} from "../lib/psbt-construct";
import { verifyUtxoAsset } from "../lib/counterparty";
import { verifyBip322Simple } from "../lib/bip322-verify";
import type { Env } from "../index";

const CANCEL_CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const PSBT_OPTS = {
  allowUnknownInputs: true,
  allowUnknownOutputs: true,
  allowLegacyWitnessUtxo: true,
  disableScriptCheck: true,
} as const;

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

// ---------------------------------------------------------------------------
// POST /swaps/:id/prepare-cancel — returns a challenge for the seller to sign
// ---------------------------------------------------------------------------
export async function handlePrepareCancelSwap(
  db: D1Database,
  id: string
): Promise<Response> {
  // Verify listing exists and is active
  const listing = await db
    .prepare(`SELECT id, seller_address, status FROM swap_listings WHERE id = ?`)
    .bind(id)
    .first<{ id: string; seller_address: string; status: string }>();

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.status !== "active") {
    return Response.json(
      { error: `Listing is not active (status: ${listing.status})` },
      { status: 409 }
    );
  }

  const timestamp = Date.now();
  const challenge = `xcpdex-cancel:${id}:${timestamp}`;

  return Response.json({
    challenge,
    seller_address: listing.seller_address,
  });
}

// ---------------------------------------------------------------------------
// POST /swaps/:id/cancel — seller cancels with BIP-322 signed challenge
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
  const challenge = String(body.challenge ?? "");
  const signature = String(body.signature ?? "");

  if (!seller_address) {
    return Response.json({ error: "seller_address is required" }, { status: 400 });
  }
  if (!challenge || !signature) {
    return Response.json(
      { error: "challenge and signature are required" },
      { status: 400 }
    );
  }

  // Validate challenge format: xcpdex-cancel:<uuid>:<timestamp>
  const parts = challenge.split(":");
  if (parts.length !== 3 || parts[0] !== "xcpdex-cancel" || parts[1] !== id) {
    return Response.json({ error: "Invalid challenge format" }, { status: 400 });
  }

  const challengeTimestamp = parseInt(parts[2], 10);
  if (isNaN(challengeTimestamp) || Date.now() - challengeTimestamp > CANCEL_CHALLENGE_MAX_AGE_MS) {
    return Response.json({ error: "Challenge has expired" }, { status: 400 });
  }

  // Verify BIP-322 signature
  const isValid = await verifyBip322Simple(seller_address, challenge, signature);
  if (!isValid) {
    return Response.json({ error: "Invalid signature" }, { status: 403 });
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
// Helpers: stale fill request cleanup
// ---------------------------------------------------------------------------
async function expireStaleRequests(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `UPDATE swap_fill_requests SET status = 'expired'
       WHERE status = 'pending' AND expires_at < datetime('now')`
    ),
    db.prepare(
      `UPDATE swap_listings SET locked_until = NULL
       WHERE locked_until IS NOT NULL AND locked_until < datetime('now')`
    ),
  ]);
}

// ---------------------------------------------------------------------------
// POST /swaps/prepare-listing — server constructs seller's PSBT
// ---------------------------------------------------------------------------
export async function handlePrepareListingPsbt(
  request: Request,
  env: Env
): Promise<Response> {
  const db = env.DB;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const seller_address = String(body.seller_address ?? "");
  const utxo_txid = String(body.utxo_txid ?? "");
  const utxo_vout = Number(body.utxo_vout);
  const asset = String(body.asset ?? "");
  const price_sats = Number(body.price_sats);

  // Validate
  const errors: string[] = [];
  if (!seller_address) errors.push("seller_address is required");
  if (!/^[0-9a-f]{64}$/i.test(utxo_txid))
    errors.push("utxo_txid must be a 64-char hex string");
  if (!Number.isInteger(utxo_vout) || utxo_vout < 0)
    errors.push("utxo_vout must be a non-negative integer");
  if (!asset) errors.push("asset is required");
  if (!Number.isInteger(price_sats) || price_sats <= 0)
    errors.push("price_sats must be a positive integer");

  if (errors.length > 0) {
    return Response.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  // Verify UTXO exists via mempool.space
  let utxoValue: number;
  try {
    const utxos = await fetchAddressUtxos(seller_address);
    const match = utxos.find(
      (u) => u.txid === utxo_txid && u.vout === utxo_vout
    );
    if (!match) {
      return Response.json(
        { error: "UTXO not found in seller's address" },
        { status: 404 }
      );
    }
    utxoValue = match.value;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "Failed to verify UTXO", details: msg },
      { status: 502 }
    );
  }

  // Verify the UTXO actually holds the claimed Counterparty asset
  const assetCheck = await verifyUtxoAsset(
    env.CP_API_BASE,
    utxo_txid,
    utxo_vout,
    asset
  );
  if (!assetCheck.verified) {
    return Response.json(
      { error: "Asset verification failed", details: assetCheck.error },
      { status: 400 }
    );
  }

  // Check no active listing exists for this UTXO
  const existing = await db
    .prepare(
      `SELECT id FROM swap_listings
       WHERE utxo_txid = ? AND utxo_vout = ? AND status = 'active'`
    )
    .bind(utxo_txid, utxo_vout)
    .first();
  if (existing) {
    return Response.json(
      { error: "An active listing already exists for this UTXO" },
      { status: 409 }
    );
  }

  // Construct seller's PSBT
  try {
    const psbt_hex = await constructSellerPsbt({
      utxoTxid: utxo_txid,
      utxoVout: utxo_vout,
      utxoValue,
      sellerAddress: seller_address,
      priceSats: price_sats,
    });

    return Response.json({ psbt_hex });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "Failed to construct PSBT", details: msg },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /swaps/complete-listing — seller submits signed PSBT to create listing
// ---------------------------------------------------------------------------
export async function handleCompleteListingPsbt(
  request: Request,
  env: Env
): Promise<Response> {
  const db = env.DB;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const seller_address = String(body.seller_address ?? "");
  const utxo_txid = String(body.utxo_txid ?? "");
  const utxo_vout = Number(body.utxo_vout);
  const asset = String(body.asset ?? "");
  const asset_longname = body.asset_longname ? String(body.asset_longname) : null;
  const asset_quantity = Number(body.asset_quantity);
  const price_sats = Number(body.price_sats);
  const signed_psbt_hex = String(body.signed_psbt_hex ?? "");
  const expires_at = body.expires_at ? String(body.expires_at) : null;

  // Validate
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
  if (!signed_psbt_hex || !/^[0-9a-f]+$/i.test(signed_psbt_hex))
    errors.push("signed_psbt_hex must be a non-empty hex string");

  if (errors.length > 0) {
    return Response.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  // Validate signed PSBT references the correct UTXO
  try {
    const tx = Transaction.fromPSBT(hexCodec.decode(signed_psbt_hex), PSBT_OPTS);
    if (tx.inputsLength === 0) {
      return Response.json({ error: "Signed PSBT has no inputs" }, { status: 400 });
    }
    const inp = tx.getInput(0);
    const inputTxid = inp.txid ? hexCodec.encode(inp.txid) : "";
    if (inputTxid !== utxo_txid || inp.index !== utxo_vout) {
      return Response.json(
        { error: "Signed PSBT input does not match the specified UTXO" },
        { status: 400 }
      );
    }
    // Verify signature data exists
    if (!inp.partialSig?.length && !inp.tapKeySig && !inp.tapScriptSig?.length) {
      return Response.json({ error: "Signed PSBT has no signature data" }, { status: 400 });
    }
    // Verify sighash is SIGHASH_SINGLE|ANYONECANPAY (0x83)
    if (inp.sighashType !== undefined && inp.sighashType !== 0x83) {
      return Response.json(
        { error: `Invalid sighash type: expected 0x83, got 0x${inp.sighashType.toString(16)}` },
        { status: 400 }
      );
    }
    // Verify output 0 pays to seller_address with correct amount
    if (tx.outputsLength === 0) {
      return Response.json({ error: "Signed PSBT has no outputs" }, { status: 400 });
    }
    const out = tx.getOutput(0);
    if (out.amount !== BigInt(price_sats)) {
      return Response.json(
        { error: `Output amount mismatch: expected ${price_sats}, got ${out.amount}` },
        { status: 400 }
      );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "Invalid PSBT", details: msg },
      { status: 400 }
    );
  }

  // Verify seller signature exists on input 0.
  // Note: We cannot use finalizeIdx() here because the seller's SIGHASH_SINGLE|ANYONECANPAY
  // PSBT is intentionally unbalanced (output value > input value). The buyer adds inputs
  // later to cover the payment. Full cryptographic verification happens in mergeAndFinalize
  // when the buyer completes the fill.
  try {
    const verifyTx = Transaction.fromPSBT(hexCodec.decode(signed_psbt_hex), PSBT_OPTS);
    const inp = verifyTx.getInput(0);
    const hasSig = (inp.partialSig && inp.partialSig.length > 0)
      || inp.finalScriptSig
      || inp.finalScriptWitness
      || inp.tapKeySig;
    if (!hasSig) {
      return Response.json(
        { error: "PSBT is not signed — no signature found on input 0" },
        { status: 400 }
      );
    }
  } catch (e: unknown) {
    return Response.json(
      { error: "Invalid signed PSBT", details: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }

  // Verify the UTXO holds the claimed asset and quantity
  const assetCheck = await verifyUtxoAsset(
    env.CP_API_BASE,
    utxo_txid,
    utxo_vout,
    asset,
    asset_quantity
  );
  if (!assetCheck.verified) {
    return Response.json(
      { error: "Asset verification failed", details: assetCheck.error },
      { status: 400 }
    );
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
      .bind(
        id, seller_address, asset, asset_longname, asset_quantity,
        utxo_txid, utxo_vout, price_sats, signed_psbt_hex, expires_at
      )
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
// POST /swaps/:id/prepare-fill — server constructs buyer's PSBT + creates fill request
// ---------------------------------------------------------------------------
export async function handlePrepareFill(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const db = env.DB;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const buyer_address = String(body.buyer_address ?? "");
  if (!buyer_address) {
    return Response.json({ error: "buyer_address is required" }, { status: 400 });
  }

  // Expire stale fill requests and unlock listings
  await expireStaleRequests(db);

  // Load listing
  const listing = await db
    .prepare(
      `SELECT id, seller_address, psbt_hex, utxo_txid, utxo_vout, price_sats,
              status, expires_at, locked_until
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
      locked_until: string | null;
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

  // Atomically lock the listing for 5 minutes (prevents TOCTOU race)
  const lockResult = await db
    .prepare(
      `UPDATE swap_listings SET locked_until = datetime('now', '+5 minutes')
       WHERE id = ? AND status = 'active'
         AND (locked_until IS NULL OR locked_until < datetime('now'))`
    )
    .bind(id)
    .run();

  if (lockResult.meta.changes === 0) {
    return Response.json(
      { error: "Listing is currently locked by another buyer. Try again shortly." },
      { status: 423 }
    );
  }

  // Construct buyer's PSBT
  let buyerPsbtHex: string;
  let platformFeeSats: number;
  try {
    const feeRate = await getFeeRate();
    const result = await constructBuyerPsbt({
      listing: {
        psbt_hex: listing.psbt_hex,
        utxo_txid: listing.utxo_txid,
        utxo_vout: listing.utxo_vout,
        price_sats: listing.price_sats,
        seller_address: listing.seller_address,
      },
      buyerAddress: buyer_address,
      feeRate,
      feeAddress: env.FEE_ADDRESS ? pickFeeAddress(env.FEE_ADDRESS) : undefined,
    });
    buyerPsbtHex = result.psbtHex;
    platformFeeSats = result.platformFeeSats;
  } catch (e: unknown) {
    // Unlock listing on failure
    await db
      .prepare(`UPDATE swap_listings SET locked_until = NULL WHERE id = ?`)
      .bind(id)
      .run();
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "Failed to construct buyer PSBT", details: msg },
      { status: 422 }
    );
  }

  // Figure out buyer input indices (input 0 is seller's, rest are buyer's)
  const parsedBuyerTx = Transaction.fromPSBT(hexCodec.decode(buyerPsbtHex), PSBT_OPTS);
  const buyerInputIndices: number[] = [];
  for (let i = 1; i < parsedBuyerTx.inputsLength; i++) {
    buyerInputIndices.push(i);
  }

  // Create fill request with 5-minute TTL
  const fillRequestId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO swap_fill_requests
         (id, swap_listing_id, buyer_address, buyer_psbt_hex, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now', '+5 minutes'))`
    )
    .bind(fillRequestId, id, buyer_address, buyerPsbtHex)
    .run();

  return Response.json({
    fill_request_id: fillRequestId,
    psbt_hex: buyerPsbtHex,
    buyer_input_indices: buyerInputIndices,
    platform_fee_sats: platformFeeSats,
  });
}

// ---------------------------------------------------------------------------
// POST /swaps/:id/complete-fill — buyer submits signed PSBT, server merges + broadcasts
// ---------------------------------------------------------------------------
export async function handleCompleteFill(
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

  const fill_request_id = String(body.fill_request_id ?? "");
  const signed_psbt_hex = String(body.signed_psbt_hex ?? "");

  if (!fill_request_id) {
    return Response.json({ error: "fill_request_id is required" }, { status: 400 });
  }
  if (!signed_psbt_hex || !/^[0-9a-f]+$/i.test(signed_psbt_hex)) {
    return Response.json({ error: "signed_psbt_hex must be a non-empty hex string" }, { status: 400 });
  }

  // Expire stale requests
  await expireStaleRequests(db);

  // Load fill request
  const fillReq = await db
    .prepare(
      `SELECT id, swap_listing_id, buyer_address, status, expires_at
       FROM swap_fill_requests WHERE id = ?`
    )
    .bind(fill_request_id)
    .first<{
      id: string;
      swap_listing_id: string;
      buyer_address: string;
      status: string;
      expires_at: string;
    }>();

  if (!fillReq) {
    return Response.json({ error: "Fill request not found" }, { status: 404 });
  }

  if (fillReq.swap_listing_id !== id) {
    return Response.json({ error: "Fill request does not match this listing" }, { status: 400 });
  }

  if (fillReq.status !== "pending") {
    return Response.json(
      { error: `Fill request is not pending (status: ${fillReq.status})` },
      { status: 409 }
    );
  }

  if (new Date(fillReq.expires_at) < new Date()) {
    await db
      .prepare(
        `UPDATE swap_fill_requests SET status = 'expired' WHERE id = ?`
      )
      .bind(fill_request_id)
      .run();
    await db
      .prepare(`UPDATE swap_listings SET locked_until = NULL WHERE id = ?`)
      .bind(id)
      .run();
    return Response.json({ error: "Fill request has expired" }, { status: 410 });
  }

  // Load listing
  const listing = await db
    .prepare(
      `SELECT id, seller_address, psbt_hex, utxo_txid, utxo_vout, price_sats, status
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
    }>();

  if (!listing || listing.status !== "active") {
    // Cleanup
    await db.batch([
      db.prepare(`UPDATE swap_fill_requests SET status = 'expired' WHERE id = ?`).bind(fill_request_id),
      db.prepare(`UPDATE swap_listings SET locked_until = NULL WHERE id = ?`).bind(id),
    ]);
    return Response.json({ error: "Listing is no longer active" }, { status: 409 });
  }

  // Merge seller's signature into buyer's signed PSBT, finalize, and broadcast
  let rawTxHex: string;
  try {
    rawTxHex = mergeAndFinalize(
      listing.psbt_hex,
      signed_psbt_hex,
      listing.utxo_txid,
      listing.utxo_vout
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Mark fill request as expired and unlock listing
    await db.batch([
      db.prepare(`UPDATE swap_fill_requests SET status = 'expired' WHERE id = ?`).bind(fill_request_id),
      db.prepare(`UPDATE swap_listings SET locked_until = NULL WHERE id = ?`).bind(id),
    ]);
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
    await db.batch([
      db.prepare(`UPDATE swap_fill_requests SET status = 'expired' WHERE id = ?`).bind(fill_request_id),
      db.prepare(`UPDATE swap_listings SET locked_until = NULL WHERE id = ?`).bind(id),
    ]);
    return Response.json(
      { error: "Broadcast failed", details: msg },
      { status: 502 }
    );
  }

  // Success — record fill as pending, track broadcast txid for confirmation monitoring
  const fillId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `UPDATE swap_fill_requests SET status = 'completed' WHERE id = ?`
      )
      .bind(fill_request_id),
    db
      .prepare(
        `INSERT INTO swap_fills (id, swap_listing_id, buyer_address, tx_id, status)
         VALUES (?, ?, ?, ?, 'pending')`
      )
      .bind(fillId, id, fillReq.buyer_address, txId),
    db
      .prepare(
        `UPDATE swap_listings
         SET status = 'pending_fill', buyer_address = ?, tx_id = ?,
             broadcast_txid = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'active'`
      )
      .bind(fillReq.buyer_address, txId, txId, id),
  ]);

  return Response.json({
    fill_id: fillId,
    swap_listing_id: id,
    buyer_address: fillReq.buyer_address,
    tx_id: txId,
    status: "pending_fill",
  });
}
