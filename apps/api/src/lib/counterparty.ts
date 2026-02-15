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

interface CPApiResponse<T> {
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
    throw new Error(`CP API error: ${res.status} ${res.statusText}`);
  }

  const data: CPApiResponse<OrderMatch> = await res.json();
  return {
    matches: data.result,
    nextCursor: data.next_cursor != null ? String(Math.floor(data.next_cursor)) : null,
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
    throw new Error(`CP API error: ${res.status} ${res.statusText}`);
  }

  const data: CPApiResponse<Order> = await res.json();
  return {
    orders: data.result,
    nextCursor: data.next_cursor != null ? String(Math.floor(data.next_cursor)) : null,
  };
}
