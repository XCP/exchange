import { cacheControl } from "../utils/cache";
import {
  COINGECKO_PAIRS,
  COINMARKETCAP_PAIRS,
  getMarketSummaries,
  INTEGRATION_PAIRS,
  STALE_AFTER_SECONDS,
} from "../lib/market-summary";

/**
 * GET /catalog/pairs — canonical market catalog for aggregator reviewers.
 *
 * Disambiguates Counterparty symbols (old tickers can collide with unrelated
 * projects on other chains) by carrying protocol, divisibility, longname, and
 * an explorer URL per asset, plus which execution sources actually feed each
 * market. execution_sources is data-driven: "pool" appears only for pairs
 * with a live AMM pool, "dispenser" only for BTC-quoted pairs (dispensers
 * settle in BTC by construction).
 */

interface AssetRow {
  asset: string;
  asset_longname: string | null;
  divisible: number;
}

interface PoolRow {
  pair: string;
}

interface CatalogAsset {
  symbol: string;
  name: string;
  protocol: "counterparty" | "bitcoin";
  divisible?: boolean;
  asset_longname?: string | null;
  asset_url?: string;
}

const BTC_ASSET: CatalogAsset = { symbol: "BTC", name: "Bitcoin", protocol: "bitcoin" };
// XCP is the protocol's native unit; it has no row in the assets mirror.
const XCP_ASSET: CatalogAsset = {
  symbol: "XCP",
  name: "Counterparty",
  protocol: "counterparty",
  divisible: true,
  asset_url: "https://xcp.io/asset/XCP",
};

function catalogAsset(symbol: string, row: AssetRow | undefined): CatalogAsset {
  if (symbol === "BTC") return BTC_ASSET;
  if (symbol === "XCP") return XCP_ASSET;
  return {
    symbol,
    name: row?.asset_longname ?? symbol,
    protocol: "counterparty",
    divisible: row ? row.divisible === 1 : undefined,
    asset_longname: row?.asset_longname ?? null,
    asset_url: `https://xcp.io/asset/${symbol}`,
  };
}

export async function handleCatalogPairs(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);

  const defs = INTEGRATION_PAIRS.map((pair) => {
    const [base, quote] = pair.split("_");
    return { pair, base, quote };
  });
  const baseSymbols = [...new Set(defs.map((d) => d.base).filter((s) => s !== "XCP"))];
  const basePh = baseSymbols.map(() => "?").join(",");
  const pairPh = defs.map(() => "?").join(",");

  const [assets, pools, summaries] = await Promise.all([
    db.prepare(`SELECT asset, asset_longname, divisible FROM assets WHERE asset IN (${basePh})`)
      .bind(...baseSymbols)
      .all<AssetRow>(),
    db.prepare(`SELECT pair FROM pools WHERE pair IN (${pairPh})`)
      .bind(...defs.map((d) => d.pair))
      .all<PoolRow>(),
    getMarketSummaries(db),
  ]);

  const assetBySymbol = new Map(assets.results.map((r) => [r.asset, r]));
  const pooledPairs = new Set(pools.results.map((r) => r.pair));
  const summaryByPair = new Map(summaries.map((s) => [s.pair, s]));

  return Response.json(
    defs.map((def) => {
      const summary = summaryByPair.get(def.pair);
      const lastTime = summary?.lastTime ?? null;
      const isStale = lastTime == null || now - lastTime > STALE_AFTER_SECONDS;
      const sources = ["order_book"];
      if (pooledPairs.has(def.pair)) sources.push("pool");
      if (def.quote === "BTC") sources.push("dispenser");
      return {
        ticker_id: def.pair,
        base: catalogAsset(def.base, assetBySymbol.get(def.base)),
        target: catalogAsset(def.quote, assetBySymbol.get(def.quote)),
        market_url: `https://xcpdex.com/limit/${def.base}/${def.quote}`,
        consumers: [
          ...(COINMARKETCAP_PAIRS.includes(def.pair) ? ["coinmarketcap"] : []),
          ...(COINGECKO_PAIRS.includes(def.pair) ? ["coingecko"] : []),
        ],
        execution_sources: sources,
        // inactive = never priced (absent from tickers); stale = priced but no
        // completed fill inside the 90-day window; active = recent fill.
        status: summary == null ? "inactive" : isStale ? "stale" : "active",
        last_trade_timestamp: lastTime != null ? lastTime * 1000 : null,
        is_stale: isStale,
      };
    }),
    { headers: { "Cache-Control": cacheControl(url, 300) } }
  );
}
