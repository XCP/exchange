interface Balance {
  asset: string;
  quantity_normalized: string;
}

interface CPBalanceResponse {
  result: Balance[];
  next_cursor: string | null;
}

async function fetchBalances(
  apiBase: string,
  address: string
): Promise<string[]> {
  const assets: string[] = [];
  let cursor: string | null = null;

  while (true) {
    const url = new URL(`${apiBase}/addresses/${address}/balances`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`CP API error: ${res.status}`);

    const data: CPBalanceResponse = await res.json();

    for (const b of data.result) {
      if (parseFloat(b.quantity_normalized) > 0) {
        assets.push(b.asset);
      }
    }

    cursor = data.next_cursor;
    if (!cursor || data.result.length === 0) break;
  }

  return assets;
}

export async function handlePortfolioBids(
  request: Request,
  db: D1Database,
  apiBase: string,
  address: string
): Promise<Response> {
  const assets = await fetchBalances(apiBase, address);

  if (assets.length === 0) {
    return Response.json({ address, bids: [] });
  }

  // Query in chunks of 80 (D1 limit ~100 params, we use a few for other binds)
  const allBids: Record<string, unknown>[] = [];
  for (let i = 0; i < assets.length; i += 80) {
    const chunk = assets.slice(i, i + 80);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await db
      .prepare(
        `SELECT pair, base_asset, quote_asset, price, amount, source,
                block_time, tx_hash, expire_index
         FROM orders
         WHERE status = 'open' AND side = 'bid' AND base_asset IN (${placeholders})
         ORDER BY base_asset, price DESC`
      )
      .bind(...chunk)
      .all();
    allBids.push(...result.results);
  }

  return Response.json(
    { address, asset_count: assets.length, bids: allBids },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}

export async function handlePortfolioOrders(
  request: Request,
  db: D1Database,
  address: string
): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset, side, price, amount,
              give_remaining, get_remaining,
              block_time, tx_hash, expire_index, status
       FROM orders
       WHERE source = ? AND status = 'open'
       ORDER BY block_time DESC`
    )
    .bind(address)
    .all();

  return Response.json(
    { address, orders: result.results },
    { headers: { "Cache-Control": "public, max-age=10" } }
  );
}
