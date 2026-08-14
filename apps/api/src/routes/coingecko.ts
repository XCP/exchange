import { cacheControl } from "../utils/cache";
import {
  dec,
  decPrice,
  getMarketSummaries,
  isIntegrationPair,
  parseTickerId,
  STALE_AFTER_SECONDS,
} from "../lib/market-summary";

/**
 * CoinGecko integration endpoints, per CoinGecko's "Integration Ideal API
 * Endpoints" spec for spot DEXs:
 *   /coingecko/pairs
 *   /coingecko/tickers
 *   /coingecko/orderbook?ticker_id=XCP_BTC&depth=100
 *   /coingecko/historical_trades?ticker_id=XCP_BTC&type=buy&limit=200
 *
 * Quantities/volumes are fixed 8-decimal strings; unit prices are
 * full-precision decimal strings (sub-satoshi unit prices are real here);
 * timestamps are UTC ms.
 *
 * trade_id is a permanent unique integer namespaced by settlement source:
 *   source_id * 8 + code, code 0 = order-book, 1 = AMM pool, 2 = dispenser,
 *   3 = reserved for PSBT/UTXO swaps.
 * source_id is the local rows' id; rows are only ever appended under a
 * protocol-derived UNIQUE key (match_id / tx_hash+dispense_index), so an id
 * is permanent unless the table itself is dropped and rebuilt.
 */

const SOURCE_CODE = { order: 0, pool: 1, dispenser: 2 } as const;

export async function handleCgPairs(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const summaries = await getMarketSummaries(db);
  return Response.json(
    summaries.map((s) => ({
      ticker_id: s.pair,
      base: s.base,
      target: s.quote,
    })),
    { headers: { "Cache-Control": cacheControl(url, 300) } }
  );
}

export async function handleCgTickers(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);
  const summaries = await getMarketSummaries(db);
  return Response.json(
    summaries.map((s) => ({
      ticker_id: s.pair,
      base_currency: s.base,
      target_currency: s.quote,
      last_price: decPrice(s.lastPrice),
      base_volume: dec(s.baseVolume24h),
      target_volume: dec(s.quoteVolume24h),
      bid: s.bestBid != null ? decPrice(s.bestBid) : null,
      ask: s.bestAsk != null ? decPrice(s.bestAsk) : null,
      high: decPrice(s.high24h ?? s.lastPrice),
      low: decPrice(s.low24h ?? s.lastPrice),
      last_trade_timestamp: s.lastTime != null ? s.lastTime * 1000 : null,
      is_stale: s.lastTime == null || now - s.lastTime > STALE_AFTER_SECONDS,
    })),
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}

export async function handleCgOrderbook(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const tickerId = url.searchParams.get("ticker_id");
  const parsed = tickerId ? parseTickerId(tickerId) : null;
  if (!parsed) {
    return Response.json({ error: "ticker_id is required, e.g. XCP_BTC" }, { status: 400 });
  }
  if (!isIntegrationPair(parsed.pair)) {
    return Response.json({ error: `Unknown ticker_id: ${parsed.pair}` }, { status: 404 });
  }

  // depth = total entries across both sides; 0 or absent = full (capped).
  const depthParam = parseInt(url.searchParams.get("depth") ?? "0", 10) || 0;
  const perSide = depthParam > 0 ? Math.min(Math.ceil(depthParam / 2), 500) : 500;

  const isBtcPair = parsed.quote === "BTC";

  const stmts = [
    db.prepare(
      `SELECT price, SUM(remaining) AS amount
       FROM orders
       WHERE pair = ? AND status = 'open' AND side = 'bid' AND remaining > 0
       GROUP BY price ORDER BY price DESC LIMIT ?`
    ).bind(parsed.pair, perSide),
    db.prepare(
      `SELECT price, SUM(remaining) AS amount
       FROM orders
       WHERE pair = ? AND status = 'open' AND side = 'ask' AND remaining > 0
       GROUP BY price ORDER BY price ASC LIMIT ?`
    ).bind(parsed.pair, perSide),
  ];
  if (isBtcPair) {
    stmts.push(
      db.prepare(
        `SELECT price, SUM(give_remaining) AS amount
         FROM dispensers
         WHERE asset = ? AND status < 10 AND give_remaining > 0 AND price > 0
         GROUP BY price ORDER BY price ASC LIMIT ?`
      ).bind(parsed.base, perSide)
    );
  }

  const results = await db.batch(stmts);
  type Level = { price: number; amount: number };
  const bids = results[0].results as unknown as Level[];
  const orderAsks = results[1].results as unknown as Level[];
  const dispenserAsks = isBtcPair ? (results[2].results as unknown as Level[]) : [];

  // Dispensers are standing sell offers settled in BTC; merge them into asks.
  const askLevels = new Map<number, number>();
  for (const a of [...orderAsks, ...dispenserAsks]) {
    askLevels.set(a.price, (askLevels.get(a.price) ?? 0) + a.amount);
  }
  const asks = [...askLevels.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, perSide);

  return Response.json(
    {
      ticker_id: parsed.pair,
      timestamp: Date.now(),
      bids: bids.map((b) => [decPrice(b.price), dec(b.amount)]),
      asks: asks.map(([price, amount]) => [decPrice(price), dec(amount)]),
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}

interface TradeRow {
  id: number;
  price: number;
  amount: number;
  volume: number;
  block_time: number;
  side: string;
  source_type: string;
  tx1_hash: string;
}

interface DispenseRow {
  id: number;
  price: number;
  dispense_quantity: number;
  block_time: number;
  tx_hash: string;
}

interface CgTrade {
  trade_id: number;
  price: string;
  base_volume: string;
  target_volume: string;
  trade_timestamp: number;
  type: "buy" | "sell";
  source: "order" | "pool" | "dispenser";
  settlement_txid: string;
}

export async function handleCgHistoricalTrades(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const tickerId = url.searchParams.get("ticker_id");
  const parsed = tickerId ? parseTickerId(tickerId) : null;
  if (!parsed) {
    return Response.json({ error: "ticker_id is required, e.g. XCP_BTC" }, { status: 400 });
  }
  if (!isIntegrationPair(parsed.pair)) {
    return Response.json({ error: `Unknown ticker_id: ${parsed.pair}` }, { status: 404 });
  }

  const typeFilter = url.searchParams.get("type"); // "buy" | "sell" | null
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 1000);
  // CG sends start_time/end_time in UTC milliseconds; our rows are unix seconds.
  const startMs = parseInt(url.searchParams.get("start_time") ?? "", 10);
  const endMs = parseInt(url.searchParams.get("end_time") ?? "", 10);
  const startSec = Number.isFinite(startMs) ? Math.floor(startMs / 1000) : null;
  const endSec = Number.isFinite(endMs) ? Math.ceil(endMs / 1000) : null;

  const isBtcPair = parsed.quote === "BTC";

  let tradeQuery = `SELECT id, price, amount, volume, block_time, side, source_type, tx1_hash
                    FROM trades WHERE pair = ?`;
  const tradeBinds: (string | number)[] = [parsed.pair];
  // Protocol-priced: the dispenser's own rate, never the shared/overpaid
  // gross BTC recorded on the dispense row (see market-summary.ts).
  let dispenseQuery = `SELECT d.id, COALESCE(p.price, d.price) AS price, d.dispense_quantity,
                              d.block_time, d.tx_hash
                       FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
                       WHERE d.asset = ?`;
  const dispenseBinds: (string | number)[] = [parsed.base];

  if (startSec != null) {
    tradeQuery += ` AND block_time >= ?`;
    tradeBinds.push(startSec);
    dispenseQuery += ` AND d.block_time >= ?`;
    dispenseBinds.push(startSec);
  }
  if (endSec != null) {
    tradeQuery += ` AND block_time <= ?`;
    tradeBinds.push(endSec);
    dispenseQuery += ` AND d.block_time <= ?`;
    dispenseBinds.push(endSec);
  }
  tradeQuery += ` ORDER BY block_time DESC, id DESC LIMIT ?`;
  tradeBinds.push(limit);
  dispenseQuery += ` ORDER BY d.block_time DESC, d.id DESC LIMIT ?`;
  dispenseBinds.push(limit);

  const stmts = [db.prepare(tradeQuery).bind(...tradeBinds)];
  // Dispenses are always buys of the base asset; skip when filtering for sells.
  if (isBtcPair && typeFilter !== "sell") {
    stmts.push(db.prepare(dispenseQuery).bind(...dispenseBinds));
  }

  const results = await db.batch(stmts);
  const tradeRows = results[0].results as unknown as TradeRow[];
  const dispenseRows = results.length > 1 ? (results[1].results as unknown as DispenseRow[]) : [];

  // A nonzero execution must never publish a zero price (upstream ingestion
  // quantizes some stored prices to 8dp; sub-1e-8 unit prices would collapse
  // to zero and corrupt ordering). Drop and log rather than publish.
  const quantizationLoss = (source: string, id: number, quantity: number) => {
    console.error({ event: "PRICE_QUANTIZATION_LOSS", ticker_id: parsed.pair, source, id, quantity });
  };

  const entries: CgTrade[] = [
    ...tradeRows.filter((t) => {
      if (t.price > 0 || t.amount <= 0) return t.price > 0;
      quantizationLoss("trades", t.id, t.amount);
      return false;
    }).map((t): CgTrade => {
      const source = t.source_type === "pool" ? "pool" : "order";
      return {
        trade_id: t.id * 8 + SOURCE_CODE[source],
        price: decPrice(t.price),
        base_volume: dec(t.amount),
        target_volume: dec(t.volume),
        trade_timestamp: t.block_time * 1000,
        type: t.side === "sell" ? "sell" : "buy",
        source,
        settlement_txid: t.tx1_hash,
      };
    }),
    ...dispenseRows.filter((d) => {
      if (d.price > 0 || d.dispense_quantity <= 0) return d.price > 0;
      quantizationLoss("dispenses", d.id, d.dispense_quantity);
      return false;
    }).map((d): CgTrade => ({
      trade_id: d.id * 8 + SOURCE_CODE.dispenser,
      price: decPrice(d.price),
      base_volume: dec(d.dispense_quantity),
      target_volume: dec(d.dispense_quantity * d.price),
      trade_timestamp: d.block_time * 1000,
      type: "buy",
      source: "dispenser",
      settlement_txid: d.tx_hash,
    })),
  ]
    .sort((a, b) => b.trade_timestamp - a.trade_timestamp || b.trade_id - a.trade_id)
    .slice(0, limit);

  const buy = entries.filter((e) => e.type === "buy");
  const sell = entries.filter((e) => e.type === "sell");

  return Response.json(
    typeFilter === "buy" ? { buy } : typeFilter === "sell" ? { sell } : { buy, sell },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}
