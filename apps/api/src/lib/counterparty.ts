import { API_TIMEOUT_MS } from "./constants";

async function fetchWithRetry(
  url: string,
  retries: number = 2,
  backoffMs: number = 1000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (res.ok) return res;
    if (res.status < 500 || attempt === retries) {
      throw new Error(`Counterparty API error: ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
  }
  throw new Error("Unreachable");
}

export interface OrderMatch {
  id: string;
  tx0_hash: string;
  tx1_hash: string;
  tx0_address: string;
  tx1_address: string;
  forward_asset: string;
  backward_asset: string;
  forward_quantity: number;
  backward_quantity: number;
  forward_quantity_normalized: string;
  backward_quantity_normalized: string;
  block_index: number;
  block_time: number;
  status: string;
}

export interface Order {
  tx_hash: string;
  tx_index: number;
  source: string;
  give_asset: string;
  give_quantity: number;
  give_remaining: number;
  get_asset: string;
  get_quantity: number;
  get_remaining: number;
  expiration: number;
  expire_index: number | null;
  block_index: number;
  block_time: number;
  status: string;
  give_quantity_normalized: string;
  get_quantity_normalized: string;
  give_remaining_normalized: string;
  get_remaining_normalized: string;
}

export interface CounterpartyDispense {
  tx_hash: string;
  dispense_index: number;
  dispenser_tx_hash: string;
  source: string;
  destination: string;
  asset: string;
  dispense_quantity: number;
  dispense_quantity_normalized: string;
  btc_amount: number;
  btc_amount_normalized: string;
  block_index: number;
  block_time: number;
}

export interface CounterpartyDispenser {
  tx_hash: string;
  tx_index: number;
  source: string;
  asset: string;
  give_quantity: number;
  give_quantity_normalized: string;
  escrow_quantity: number;
  escrow_quantity_normalized: string;
  give_remaining: number;
  give_remaining_normalized: string;
  satoshirate: number;
  satoshirate_normalized: string;
  satoshi_price: number;
  price: number;
  price_normalized: string;
  status: number;
  dispense_count: number;
  block_index: number;
  block_time: number;
  oracle_address: string | null;
}

interface CounterpartyApiResponse<T> {
  result: T[];
  next_cursor: number | null;
  result_count: number;
}

export async function fetchOrderMatches(
  apiBase: string,
  cursor?: string | null,
  limit: number = 200
): Promise<{ matches: OrderMatch[]; nextCursor: string | null }> {
  const url = new URL(`${apiBase}/order_matches`);
  url.searchParams.set("status", "completed");
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const res = await fetchWithRetry(url.toString());
  const data: CounterpartyApiResponse<OrderMatch> = await res.json();
  return {
    matches: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
}

export async function fetchDispenses(
  apiBase: string,
  cursor?: string | null,
  limit: number = 200
): Promise<{ dispenses: CounterpartyDispense[]; nextCursor: string | null }> {
  const url = new URL(`${apiBase}/dispenses`);
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const res = await fetchWithRetry(url.toString());
  const data: CounterpartyApiResponse<CounterpartyDispense> = await res.json();
  return {
    dispenses: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
}

export async function fetchDispensers(
  apiBase: string,
  status: number | null = 0,
  cursor?: string | null,
  limit: number = 200
): Promise<{ dispensers: CounterpartyDispenser[]; nextCursor: string | null }> {
  const url = new URL(`${apiBase}/dispensers`);
  if (status != null) url.searchParams.set("status", String(status));
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const res = await fetchWithRetry(url.toString());
  const data: CounterpartyApiResponse<CounterpartyDispenser> = await res.json();
  return {
    dispensers: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
}

/**
 * Verify that a UTXO holds the expected Counterparty asset.
 * Calls the Counterparty API: GET /utxos/{txid}:{vout}/balances
 */
export async function verifyUtxoAsset(
  apiBase: string,
  utxoTxid: string,
  utxoVout: number,
  expectedAsset: string,
  expectedQuantity?: number
): Promise<{ verified: boolean; error?: string; quantity?: number; quantity_normalized?: string }> {
  try {
    const res = await fetchWithRetry(
      `${apiBase}/utxos/${utxoTxid}:${utxoVout}/balances?verbose=true`
    );
    const data: { result: Array<{ asset: string; quantity: number; quantity_normalized: string; asset_longname: string | null }> } =
      await res.json();

    const match = data.result.find(
      (b) => b.asset === expectedAsset || b.asset_longname === expectedAsset
    );

    if (!match) {
      return {
        verified: false,
        error: `UTXO ${utxoTxid}:${utxoVout} does not hold asset ${expectedAsset}`,
      };
    }

    if (match.quantity <= 0) {
      return {
        verified: false,
        error: `UTXO has zero quantity of ${expectedAsset}`,
      };
    }

    if (expectedQuantity !== undefined && match.quantity < expectedQuantity) {
      return {
        verified: false,
        error: `UTXO holds ${match.quantity} of ${expectedAsset}, expected at least ${expectedQuantity}`,
      };
    }

    return { verified: true, quantity: match.quantity, quantity_normalized: match.quantity_normalized };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { verified: false, error: `Failed to verify UTXO asset: ${msg}` };
  }
}

export async function fetchOrderByHash(
  apiBase: string,
  txHash: string
): Promise<Order | null> {
  try {
    const res = await fetchWithRetry(`${apiBase}/orders/${txHash}?verbose=true`);
    const data: { result: Order } = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

export async function fetchOrders(
  apiBase: string,
  status: string = "open",
  cursor?: string | null,
  limit: number = 200
): Promise<{ orders: Order[]; nextCursor: string | null }> {
  const url = new URL(`${apiBase}/orders`);
  url.searchParams.set("status", status);
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const res = await fetchWithRetry(url.toString());
  const data: CounterpartyApiResponse<Order> = await res.json();
  return {
    orders: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
}
