import { cacheControl } from "../utils/cache";
import { dec, decPrice, getMarketSummaries, STALE_AFTER_SECONDS } from "../lib/market-summary";

/**
 * CoinMarketCap integration endpoint (Ideal API "summary"):
 *   /coinmarketcap/summary
 *
 * Same underlying numbers as the CoinGecko tickers endpoint — one dataset,
 * two presentations. Quantities/volumes are fixed 8-decimal strings; unit
 * prices are full-precision decimal strings; type is always "spot"
 * (Counterparty DEX has no derivatives).
 */
export async function handleCmcSummary(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);
  const summaries = await getMarketSummaries(db);
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
