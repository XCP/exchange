interface Balance {
  asset: string;
  quantity_normalized: string;
}

interface CounterpartyBalanceResponse {
  result: Balance[];
  next_cursor: string | number | null;
}

async function fetchBalances(
  apiBase: string,
  address: string
): Promise<string[]> {
  const assets: string[] = [];
  let cursor: string | null = null;

  // Safety limit: max 5 pages (1000 assets) to prevent infinite loops
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${apiBase}/addresses/${address}/balances`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Counterparty API error: ${res.status}`);

    const data: CounterpartyBalanceResponse = await res.json();

    if (!data.result || !Array.isArray(data.result)) break;

    for (const b of data.result) {
      if (parseFloat(b.quantity_normalized) > 0) {
        assets.push(b.asset);
      }
    }

    // next_cursor can be string or number from CP API
    cursor = data.next_cursor != null ? String(data.next_cursor) : null;
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
  let assets: string[];
  try {
    assets = await fetchBalances(apiBase, address);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fetchBalances failed:", msg);
    return Response.json(
      { error: `Failed to fetch balances: ${msg}` },
      { status: 502 }
    );
  }

  if (assets.length === 0) {
    return Response.json({ address, asset_count: 0, bids: [] });
  }

  // Query in chunks of 79 (D1 limit ~100 params, 1 used for source exclusion)
  const allBids: Record<string, unknown>[] = [];
  for (let i = 0; i < assets.length; i += 79) {
    const chunk = assets.slice(i, i + 79);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await db
      .prepare(
        `SELECT pair, base_asset, quote_asset, price, amount, source,
                block_time, tx_hash, expire_index
         FROM orders
         WHERE status = 'open'
           AND side = 'bid'
           AND base_asset IN (${placeholders})
           AND source != ?
         ORDER BY base_asset, price DESC`
      )
      .bind(...chunk, address)
      .all();
    allBids.push(...result.results);
  }

  return Response.json(
    { address, asset_count: assets.length, bids: allBids },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}

export async function handlePortfolioDispensers(
  request: Request,
  db: D1Database,
  address: string
): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT tx_hash, asset, source, give_quantity, give_remaining,
              satoshi_price, price, status, dispense_count, block_time
       FROM dispensers
       WHERE source = ? AND status < 10
       ORDER BY block_time DESC`
    )
    .bind(address)
    .all();

  return Response.json(
    { address, dispensers: result.results },
    { headers: { "Cache-Control": "public, max-age=60" } }
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
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
