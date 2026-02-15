import { fetchOrders, Order } from "../lib/counterparty";
import { determineBaseQuote, makePairString } from "../lib/pairs";

interface NormalizedOrder {
  tx_hash: string;
  tx_index: number;
  pair: string;
  base_asset: string;
  quote_asset: string;
  source: string;
  side: "bid" | "ask";
  price: number;
  amount: number;
  give_remaining: number;
  get_remaining: number;
  expiration: number;
  expire_index: number;
  block_index: number;
  block_time: number;
}

function normalizeOrder(order: Order): NormalizedOrder {
  const { base, quote } = determineBaseQuote(
    order.give_asset,
    order.get_asset
  );
  const pair = makePairString(base, quote);

  const giveRemaining = parseFloat(order.give_remaining_normalized);
  const getRemaining = parseFloat(order.get_remaining_normalized);

  let price: number;
  let amount: number;
  let side: "bid" | "ask";

  if (order.give_asset === quote) {
    // Giving quote to get base → buying base → bid
    side = "bid";
    amount = getRemaining; // base qty they want
    price = giveRemaining / getRemaining; // quote per base
  } else {
    // Giving base to get quote → selling base → ask
    side = "ask";
    amount = giveRemaining; // base qty they're selling
    price = getRemaining / giveRemaining; // quote per base
  }

  return {
    tx_hash: order.tx_hash,
    tx_index: order.tx_index,
    pair,
    base_asset: base,
    quote_asset: quote,
    source: order.source,
    side,
    price,
    amount,
    give_remaining: giveRemaining,
    get_remaining: getRemaining,
    expiration: order.expiration,
    expire_index: order.expire_index,
    block_index: order.block_index,
    block_time: order.block_time,
  };
}

export async function syncOrders(
  db: D1Database,
  apiBase: string
): Promise<{ synced: number; closed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch ALL open orders from CP API (paginate through everything)
  const allOrders: NormalizedOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 500) {
    const { orders, nextCursor } = await fetchOrders(
      apiBase,
      "open",
      cursor
    );

    if (orders.length === 0) break;

    for (const order of orders) {
      try {
        allOrders.push(normalizeOrder(order));
      } catch (e) {
        console.error(`Failed to normalize order ${order.tx_hash}:`, e);
      }
    }

    cursor = nextCursor;
    pages++;
    if (!nextCursor) break;
  }

  // Upsert all open orders
  for (let i = 0; i < allOrders.length; i += 50) {
    const batch = allOrders.slice(i, i + 50);
    const stmts = batch.map((o) =>
      db
        .prepare(
          `INSERT INTO orders
           (tx_hash, tx_index, pair, base_asset, quote_asset, source, side,
            price, amount, give_remaining, get_remaining,
            expiration, expire_index, block_index, block_time,
            status, first_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
           ON CONFLICT (tx_hash) DO UPDATE SET
             amount = excluded.amount,
             give_remaining = excluded.give_remaining,
             get_remaining = excluded.get_remaining,
             status = 'open',
             closed_at = NULL`
        )
        .bind(
          o.tx_hash,
          o.tx_index,
          o.pair,
          o.base_asset,
          o.quote_asset,
          o.source,
          o.side,
          o.price,
          o.amount,
          o.give_remaining,
          o.get_remaining,
          o.expiration,
          o.expire_index,
          o.block_index,
          o.block_time,
          now
        )
    );
    await db.batch(stmts);
  }

  // Close orders that were open in our DB but not in the fresh set
  const openHashes = new Set(allOrders.map((o) => o.tx_hash));
  const dbOpen = await db
    .prepare(`SELECT tx_hash FROM orders WHERE status = 'open'`)
    .all<{ tx_hash: string }>();

  const toClose = dbOpen.results.filter((r) => !openHashes.has(r.tx_hash));

  for (let i = 0; i < toClose.length; i += 50) {
    const batch = toClose.slice(i, i + 50);
    const stmts = batch.map((r) =>
      db
        .prepare(
          `UPDATE orders SET status = 'closed', closed_at = ? WHERE tx_hash = ?`
        )
        .bind(now, r.tx_hash)
    );
    await db.batch(stmts);
  }

  // Update pair_stats with order book metrics for all pairs that have orders
  const pairsWithOrders = await db
    .prepare(
      `SELECT pair, base_asset, quote_asset,
              COUNT(*) as open_orders,
              SUM(CASE WHEN side = 'bid' THEN 1 ELSE 0 END) as bid_count,
              SUM(CASE WHEN side = 'ask' THEN 1 ELSE 0 END) as ask_count,
              MAX(CASE WHEN side = 'bid' THEN price END) as best_bid,
              MIN(CASE WHEN side = 'ask' THEN price END) as best_ask
       FROM orders WHERE status = 'open'
       GROUP BY pair`
    )
    .all<{
      pair: string;
      base_asset: string;
      quote_asset: string;
      open_orders: number;
      bid_count: number;
      ask_count: number;
      best_bid: number | null;
      best_ask: number | null;
    }>();

  for (let i = 0; i < pairsWithOrders.results.length; i += 50) {
    const batch = pairsWithOrders.results.slice(i, i + 50);
    const stmts = batch.map((p) => {
      const spread =
        p.best_bid && p.best_ask
          ? ((p.best_ask - p.best_bid) / p.best_ask) * 100
          : null;

      return db
        .prepare(
          `INSERT INTO pair_stats (pair, base_asset, quote_asset, open_orders, bid_count, ask_count, best_bid, best_ask, spread, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (pair) DO UPDATE SET
             open_orders = excluded.open_orders,
             bid_count = excluded.bid_count,
             ask_count = excluded.ask_count,
             best_bid = excluded.best_bid,
             best_ask = excluded.best_ask,
             spread = excluded.spread,
             updated_at = excluded.updated_at`
        )
        .bind(
          p.pair,
          p.base_asset,
          p.quote_asset,
          p.open_orders,
          p.bid_count,
          p.ask_count,
          p.best_bid,
          p.best_ask,
          spread,
          now
        );
    });
    await db.batch(stmts);
  }

  // Zero out order stats for pairs that no longer have open orders
  await db
    .prepare(
      `UPDATE pair_stats SET open_orders = 0, bid_count = 0, ask_count = 0,
       best_bid = NULL, best_ask = NULL, spread = NULL
       WHERE open_orders > 0 AND pair NOT IN (
         SELECT DISTINCT pair FROM orders WHERE status = 'open'
       )`
    )
    .run();

  return { synced: allOrders.length, closed: toClose.length };
}
