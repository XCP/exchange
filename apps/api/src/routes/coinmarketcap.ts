import { cacheControl } from "../utils/cache";
import {
  COINMARKETCAP_PAIRS,
  dec,
  decPrice,
  getMarketSummaries,
  isIntegrationPair,
  parseTickerId,
  STALE_AFTER_SECONDS,
} from "../lib/market-summary";
import { handleCgHistoricalTrades, handleCgOrderbook } from "./coingecko";

/**
 * CoinMarketCap Ideal API adapters. The public paths stay separate from the
 * CoinGecko adapters, while the completed settlements, book construction, and
 * quantity/price formatting are shared.
 */

// Verified public CMC UCIDs. This registry is deliberately mandatory: symbols
// collide, so a CMC-profile pair must never be published without exact identity.
export const CMC_ASSET_IDS: Readonly<Record<string, number>> = {
  BTC: 1,
  XCP: 132,
  PEPECASH: 1405,
  BITCRYSTALS: 1063,
  SCOTCOIN: 346,
  SJCX: 549,
  LTBCOIN: 550,
  FLDC: 606,
  ZAIF: 1219,
  RUSTBITS: 1870,
};

interface AssetRow {
  asset: string;
  asset_longname: string | null;
}

interface CgTrade {
  trade_id: number;
  price: string;
  base_volume: string;
  target_volume: string;
  trade_timestamp: number;
  type: "buy" | "sell";
}

function pairAssets(): string[] {
  return [...new Set(COINMARKETCAP_PAIRS.flatMap((pair) => pair.split("_")))];
}

function cmcAssetId(symbol: string): number {
  const id = CMC_ASSET_IDS[symbol];
  if (id == null) throw new Error(`Missing CoinMarketCap UCID for ${symbol}`);
  return id;
}

const CMC_PROFILE_ASSETS = pairAssets();
for (const symbol of CMC_PROFILE_ASSETS) cmcAssetId(symbol);

function validatePair(marketPair: string): { pair: string } | Response {
  const parsed = parseTickerId(marketPair);
  if (!parsed) {
    return Response.json({ error: "market_pair is required, e.g. XCP_BTC" }, { status: 400 });
  }
  if (!isIntegrationPair(parsed.pair, COINMARKETCAP_PAIRS)) {
    return Response.json({ error: `Unknown market_pair: ${parsed.pair}` }, { status: 404 });
  }
  return parsed;
}

function internalCgRequest(request: Request, path: string, pair: string): Request {
  const url = new URL(request.url);
  url.pathname = path;
  url.searchParams.set("ticker_id", pair);
  return new Request(url, { method: "GET", headers: request.headers });
}

/** CMC summary: overview of every pair in the CMC-specific profile. */
export async function handleCmcSummary(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);
  const summaries = await getMarketSummaries(db, COINMARKETCAP_PAIRS);
  return Response.json(
    summaries.map((s) => ({
      trading_pairs: s.pair,
      base_currency: s.base,
      quote_currency: s.quote,
      last_price: decPrice(s.lastPrice),
      lowest_ask: s.bestAsk != null ? decPrice(s.bestAsk) : null,
      highest_bid: s.bestBid != null ? decPrice(s.bestBid) : null,
      base_volume: dec(s.baseVolume24h),
      quote_volume: dec(s.quoteVolume24h),
      price_change_percent_24h: s.priceChangePct24h.toFixed(2),
      highest_price_24h: decPrice(s.high24h ?? s.lastPrice),
      lowest_price_24h: decPrice(s.low24h ?? s.lastPrice),
      last_trade_timestamp: s.lastTime != null ? s.lastTime * 1000 : null,
      is_stale: s.lastTime == null || now - s.lastTime > STALE_AFTER_SECONDS,
      type: "spot",
    })),
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}

/** CMC A1: asset identity/status for currencies used by the CMC profile. */
export async function handleCmcAssets(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const symbols = CMC_PROFILE_ASSETS;
  const counterpartySymbols = symbols.filter((symbol) => symbol !== "BTC" && symbol !== "XCP");
  const placeholders = counterpartySymbols.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT asset, asset_longname FROM assets WHERE asset IN (${placeholders})`
  ).bind(...counterpartySymbols).all<AssetRow>();
  const metadata = new Map(result.results.map((row) => [row.asset, row]));

  const assets: Record<string, Record<string, unknown>> = {};
  for (const symbol of symbols) {
    const row = metadata.get(symbol);
    assets[symbol] = {
      name: symbol === "BTC" ? "Bitcoin" : symbol === "XCP" ? "Counterparty" : row?.asset_longname ?? symbol,
      unified_cryptoasset_id: cmcAssetId(symbol),
      can_withdraw: true,
      can_deposit: true,
      maker_fee: "0",
      taker_fee: "0",
      network: symbol === "BTC" ? "bitcoin" : "counterparty",
      self_custodial: true,
      asset_url: symbol === "BTC" ? "https://bitcoin.org" : `https://xcp.io/asset/${symbol}`,
    };
  }

  return Response.json(assets, { headers: { "Cache-Control": cacheControl(url, 300) } });
}

/** CMC A2: rolling ticker values keyed by market pair. */
export async function handleCmcTicker(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);
  const summaries = await getMarketSummaries(db, COINMARKETCAP_PAIRS);
  const tickers: Record<string, Record<string, unknown>> = {};
  for (const summary of summaries) {
    tickers[summary.pair] = {
      base_id: cmcAssetId(summary.base),
      quote_id: cmcAssetId(summary.quote),
      base_currency: summary.base,
      quote_currency: summary.quote,
      last_price: decPrice(summary.lastPrice),
      base_volume: dec(summary.baseVolume24h),
      quote_volume: dec(summary.quoteVolume24h),
      isFrozen: summary.lastTime == null || now - summary.lastTime > STALE_AFTER_SECONDS ? 1 : 0,
      last_trade_timestamp: summary.lastTime != null ? summary.lastTime * 1000 : null,
    };
  }
  return Response.json(tickers, { headers: { "Cache-Control": cacheControl(url, 60) } });
}

/** CMC A3: full level-2 depth for one CMC-profile pair. */
export async function handleCmcOrderbook(
  request: Request,
  db: D1Database,
  marketPair: string
): Promise<Response> {
  const parsed = validatePair(marketPair);
  if (parsed instanceof Response) return parsed;
  const cgResponse = await handleCgOrderbook(
    internalCgRequest(request, "/coingecko/orderbook", parsed.pair),
    db,
    COINMARKETCAP_PAIRS
  );
  if (!cgResponse.ok) return cgResponse;
  const book = await cgResponse.json() as {
    timestamp: number;
    bids: [string, string][];
    asks: [string, string][];
  };
  return Response.json(
    { timestamp: book.timestamp, bids: book.bids, asks: book.asks },
    { headers: { "Cache-Control": cgResponse.headers.get("Cache-Control") ?? "public, max-age=60" } }
  );
}

/** CMC A4: completed trades, defaulting to the last 24 hours, newest first. */
export async function handleCmcTrades(
  request: Request,
  db: D1Database,
  marketPair: string
): Promise<Response> {
  const parsed = validatePair(marketPair);
  if (parsed instanceof Response) return parsed;
  const cgRequest = internalCgRequest(request, "/coingecko/historical_trades", parsed.pair);
  const url = new URL(cgRequest.url);
  if (!url.searchParams.has("start_time")) {
    url.searchParams.set("start_time", String(Math.floor(Date.now() / 1000) - 86400));
  }
  if (!url.searchParams.has("limit")) url.searchParams.set("limit", "0");
  const cgResponse = await handleCgHistoricalTrades(
    new Request(url, { headers: request.headers }),
    db,
    COINMARKETCAP_PAIRS
  );
  if (!cgResponse.ok) return cgResponse;
  const grouped = await cgResponse.json() as { buy?: CgTrade[]; sell?: CgTrade[] };
  const trades = [...(grouped.buy ?? []), ...(grouped.sell ?? [])]
    .sort((a, b) => b.trade_timestamp - a.trade_timestamp || b.trade_id - a.trade_id)
    .map((trade) => ({
      trade_id: trade.trade_id,
      price: trade.price,
      base_volume: trade.base_volume,
      quote_volume: trade.target_volume,
      timestamp: trade.trade_timestamp * 1000,
      type: trade.type,
    }));
  return Response.json(trades, {
    headers: { "Cache-Control": cgResponse.headers.get("Cache-Control") ?? "public, max-age=60" },
  });
}
