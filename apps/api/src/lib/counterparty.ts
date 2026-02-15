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
  expire_index: number;
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

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Counterparty API error: ${res.status} ${res.statusText}`);
  }

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

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Counterparty API error: ${res.status} ${res.statusText}`);
  }

  const data: CounterpartyApiResponse<CounterpartyDispense> = await res.json();
  return {
    dispenses: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
}

export async function fetchDispensers(
  apiBase: string,
  status: number = 0,
  cursor?: string | null,
  limit: number = 200
): Promise<{ dispensers: CounterpartyDispenser[]; nextCursor: string | null }> {
  const url = new URL(`${apiBase}/dispensers`);
  url.searchParams.set("status", String(status));
  url.searchParams.set("verbose", "true");
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Counterparty API error: ${res.status} ${res.statusText}`);
  }

  const data: CounterpartyApiResponse<CounterpartyDispenser> = await res.json();
  return {
    dispensers: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
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

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Counterparty API error: ${res.status} ${res.statusText}`);
  }

  const data: CounterpartyApiResponse<Order> = await res.json();
  return {
    orders: data.result,
    nextCursor: data.next_cursor != null ? String(data.next_cursor) : null,
  };
}
