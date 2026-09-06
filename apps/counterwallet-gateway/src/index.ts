export interface Env {
  XCPDEX_API: Fetcher;
}

const PRIMARY_HOST = "api.counterwallet.io";
const API_ORIGIN = "https://api.xcpdex.com";

/**
 * Public adapter paths already implemented by xcpdex-api. Both the original
 * paths and stable /api/v1 aliases are served on api.counterwallet.io. Keeping the
 * adapters separate is intentional: their schemas and market policies are
 * consumer-specific even though they share the same indexed settlements.
 */
export const UPSTREAM_API_PATHS = [
  "/catalog/pairs",
  "/coingecko/historical_trades",
  "/coingecko/orderbook",
  "/coingecko/pairs",
  "/coingecko/tickers",
  "/coinmarketcap/assets",
  "/coinmarketcap/summary",
  "/coinmarketcap/ticker",
  "/defillama/volume",
  "/openapi.json",
] as const;

export const API_ROUTES = new Map<string, string>([
  ...UPSTREAM_API_PATHS.map((path) => [path, path] as const),
  ...UPSTREAM_API_PATHS.map((path) => [`/api/v1${path}`, path] as const),
  ["/status.json", "/status"],
  ["/api/v1/status", "/status"],
]);

function resolveUpstreamApiPath(path: string): string | undefined {
  const fixed = API_ROUTES.get(path);
  if (fixed) return fixed;
  const match = path.match(/^\/(?:api\/v1\/)?coinmarketcap\/(orderbook|trades)\/([A-Za-z0-9.]+_[A-Za-z0-9.]+)$/);
  return match ? `/coinmarketcap/${match[1]}/${match[2]}` : undefined;
}

const API_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const securityHeaders = {
  "access-control-allow-origin": "*",
  "cross-origin-resource-policy": "cross-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

function canonicalPath(pathname: string): string {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function withoutBodyForHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function methodNotAllowed(allow = "GET, HEAD"): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow,
      "content-type": "text/plain; charset=utf-8",
      ...securityHeaders,
    },
  });
}

function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, HEAD, OPTIONS",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-max-age": "86400",
      "cache-control": "public, max-age=86400",
      ...securityHeaders,
    },
  });
}

function htmlResponse(
  request: Request,
  title: string,
  body: string,
  status = 200,
  cache = "public, max-age=300"
): Response {
  const response = new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { color: #172033; font: 16px/1.55 system-ui, sans-serif; margin: 3rem auto; max-width: 52rem; padding: 0 1.25rem; }
    h1, h2 { line-height: 1.2; }
    code { background: #f1f4f8; border-radius: .25rem; padding: .1rem .3rem; }
    pre { background: #f1f4f8; border-radius: .4rem; line-height: 1.4; overflow-x: auto; padding: 1rem; }
    pre code { background: none; padding: 0; }
    .endpoint { border-top: 1px solid #dfe4ec; margin-top: 1.5rem; padding-top: .75rem; }
    .verb { color: #087443; font-weight: 700; }
    li { margin: .45rem 0; }
    table { border-collapse: collapse; font-size: .92rem; width: 100%; }
    th, td { border-bottom: 1px solid #dfe4ec; padding: .55rem .4rem; text-align: left; }
    th { color: #526078; }
    .ok { color: #087443; }
    .bad { color: #a52828; }
    .muted { color: #637087; }
    .scroll { overflow-x: auto; }
  </style>
</head>
<body>${body}</body>
</html>`,
    {
      status,
      headers: {
        "cache-control": cache,
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        "content-type": "text/html; charset=utf-8",
        ...securityHeaders,
      },
    }
  );
  return withoutBodyForHead(request, response);
}

function verificationPage(request: Request): Response {
  return htmlResponse(
    request,
    "Counterparty DEX market data",
    `<h1>Counterparty DEX market data</h1>
<p><strong>api.counterwallet.io</strong> is the Counterwallet-domain gateway for
market data indexed from settled Counterparty transactions on Bitcoin.</p>
<p>The CoinMarketCap feed provides current and historical Counterparty DEX data
only for assets CoinMarketCap already lists. Other Counterparty markets are
deliberately excluded from that integration.</p>
<p>The initial CoinGecko submission profile publishes only <strong>XCP/BTC</strong>.
Additional Counterparty assets will be added only after exact CoinGecko identity approval.</p>
<h2>Integration endpoints</h2>
<ul>
  <li><a href="/api/v1/coinmarketcap/summary">CoinMarketCap summary</a></li>
  <li><a href="/api/v1/coinmarketcap/assets">CoinMarketCap assets</a></li>
  <li><a href="/api/v1/coinmarketcap/ticker">CoinMarketCap ticker</a></li>
  <li><a href="/api/v1/coingecko/tickers">CoinGecko tickers</a></li>
  <li><a href="/api/v1/catalog/pairs">Market and asset catalog</a></li>
  <li><a href="/api/v1/openapi.json">OpenAPI document</a></li>
</ul>
<p><a href="/docs">API reference and response shapes</a> ·
<a href="/methodology">Methodology</a> ·
<a href="/status">Gateway status</a> ·
<a href="https://xcpdex.com">Public trading interface</a> ·
<a href="https://counterparty.io">Counterparty</a></p>`
  );
}

function documentationPage(request: Request): Response {
  return htmlResponse(
    request,
    "Counterparty DEX market-data API reference",
    `<h1>Counterparty DEX API reference</h1>
<p>Base URL: <code>https://api.counterwallet.io/api/v1</code>. All endpoints are
public, read-only <code>GET</code> requests returning JSON with CORS enabled.</p>
<ul>
  <li>Prices and quantities are decimal strings, avoiding floating-point loss.</li>
  <li>Ticker and order-book timestamps are Unix milliseconds.</li>
  <li>CoinGecko historical-trade timestamps are Unix seconds, as required by its schema.</li>
  <li>Rolling volume covers the 24 hours before the request, using settlement time.</li>
</ul>
<h2>CoinMarketCap</h2>
<p>Current and historical Counterparty DEX data is limited to assets
CoinMarketCap already lists. Other protocol markets are intentionally excluded
from this adapter.</p>

<div class="endpoint"><h3><span class="verb">GET</span> <a href="/api/v1/coinmarketcap/summary"><code>/coinmarketcap/summary</code></a></h3>
<p>One summary object per published market.</p>
<pre><code>[
  {
    "trading_pairs": "XCP_BTC",
    "base_currency": "XCP",
    "quote_currency": "BTC",
    "last_price": "0.000059",
    "lowest_ask": "0.000060",
    "highest_bid": null,
    "base_volume": "1191.00000000",
    "quote_volume": "0.07107040",
    "price_change_percent_24h": "3.51",
    "highest_price_24h": "0.000060",
    "lowest_price_24h": "0.000057",
    "last_trade_timestamp": 1788369632000,
    "is_stale": false,
    "type": "spot"
  }
]</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <a href="/api/v1/coinmarketcap/assets"><code>/coinmarketcap/assets</code></a></h3>
<p>Asset metadata keyed by symbol. Every published asset has a verified CoinMarketCap UCID.</p>
<pre><code>{
  "XCP": {
    "name": "Counterparty",
    "unified_cryptoasset_id": 132,
    "can_withdraw": true,
    "can_deposit": true,
    "maker_fee": "0",
    "taker_fee": "0",
    "network": "counterparty",
    "self_custodial": true,
    "asset_url": "https://xcp.io/asset/XCP"
  }
}</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <a href="/api/v1/coinmarketcap/ticker"><code>/coinmarketcap/ticker</code></a></h3>
<p>Rolling ticker objects keyed by market pair. <code>isFrozen: 1</code> identifies a historical market whose last settlement is more than 90 days old.</p>
<pre><code>{
  "XCP_BTC": {
    "base_id": 132,
    "quote_id": 1,
    "base_currency": "XCP",
    "quote_currency": "BTC",
    "last_price": "0.000059",
    "base_volume": "1191.00000000",
    "quote_volume": "0.07107040",
    "isFrozen": 0,
    "last_trade_timestamp": 1788369632000
  }
}</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <code>/coinmarketcap/orderbook/{market_pair}</code></h3>
<p>Price-level arrays are <code>[price, base quantity]</code>. Optional <code>?depth=100</code>; zero or omitted returns all available levels, capped at 500 per side.</p>
<pre><code>{
  "timestamp": 1788372679760,
  "bids": [],
  "asks": [["0.000060", "1196.00000000"]]
}</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <code>/coinmarketcap/trades/{market_pair}</code></h3>
<p>Completed settlements, newest first. Optional parameters: <code>start_time</code>, <code>end_time</code>, and <code>limit</code> (maximum 1000).</p>
<pre><code>[
  {
    "trade_id": 2176994,
    "price": "0.000059",
    "base_volume": "15.00000000",
    "quote_volume": "0.00088500",
    "timestamp": 1788369632000,
    "type": "buy"
  }
]</code></pre></div>

<h2>CoinGecko</h2>
<p>The initial submission profile contains only <code>XCP_BTC</code>. This avoids
mapping older Counterparty assets to unrelated projects that reuse their symbols.</p>

<div class="endpoint"><h3><span class="verb">GET</span> <a href="/api/v1/coingecko/pairs"><code>/coingecko/pairs</code></a></h3>
<pre><code>[
  {
    "ticker_id": "XCP_BTC",
    "base": "XCP",
    "target": "BTC",
    "pool_id": "XCP_BTC"
  }
]</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <a href="/api/v1/coingecko/tickers"><code>/coingecko/tickers</code></a></h3>
<p>AMM-backed rows additionally include <code>liquidity_in_usd</code>.</p>
<pre><code>[
  {
    "ticker_id": "XCP_BTC",
    "base_currency": "XCP",
    "target_currency": "BTC",
    "pool_id": "XCP_BTC",
    "last_price": "0.000059",
    "base_volume": "1191.00000000",
    "target_volume": "0.07107040",
    "bid": null,
    "ask": "0.000060",
    "high": "0.000060",
    "low": "0.000057",
    "last_trade_timestamp": 1788369632000,
    "is_stale": false
  }
]</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <code>/coingecko/orderbook?ticker_id=XCP_BTC&amp;depth=100</code></h3>
<pre><code>{
  "ticker_id": "XCP_BTC",
  "timestamp": 1788372679760,
  "bids": [],
  "asks": [["0.000060", "1196.00000000"]]
}</code></pre></div>

<div class="endpoint"><h3><span class="verb">GET</span> <code>/coingecko/historical_trades?ticker_id=XCP_BTC&amp;limit=100</code></h3>
<p>Optional <code>type</code>, <code>start_time</code>, and <code>end_time</code> filters. Trade timestamps are Unix seconds.</p>
<pre><code>{
  "buy": [
    {
      "trade_id": 2176994,
      "price": "0.000059",
      "base_volume": "15.00000000",
      "target_volume": "0.00088500",
      "trade_timestamp": 1788369632,
      "type": "buy",
      "source": "dispenser",
      "settlement_txid": "79611adc...def37"
    }
  ],
  "sell": []
}</code></pre></div>

<h2>Reference</h2>
<p><a href="/api/v1/openapi.json">OpenAPI document</a> ·
<a href="/methodology">Methodology</a> ·
<a href="/market-data/markets">Supported-market catalog</a> ·
<a href="/status">Status</a> ·
<a href="/">Gateway home</a></p>`
  );
}

function methodologyPage(request: Request): Response {
  return htmlResponse(
    request,
    "Counterparty DEX market-data methodology",
    `<h1>Market-data methodology</h1>
<p>The adapters share one normalized record of settled protocol activity but
use separate schemas and market inclusion policies for each data consumer.</p>
<ul>
  <li>Order-book volume counts completed Counterparty settlements.</li>
  <li>Pool volume counts completed constant-product AMM fills.</li>
  <li>BTC dispenser volume uses protocol-priced notional quantity and does not
  multiply a shared or overpaid Bitcoin output across multiple dispenses.</li>
  <li>BTC-quoted open DEX orders are excluded from published depth because the
  BTC leg is not committed at order creation. Only completed BTCPay settlements
  enter trade, price, and volume data; escrow-backed dispensers remain asks.</li>
  <li>Pending BTC order matches and off-protocol PSBT/UTXO swaps are excluded.</li>
  <li>Pool liquidity is both reserves valued at the pool ratio, then converted
  through the current XCP/USD or BTC/USD anchor published by XCP.io. Counterparty
  pools use the constant-product <code>x × y = k</code> curve, with input fees of
  50 bps when either leg is XCP and 100 bps otherwise.</li>
  <li>All rolling volumes use settlement time. Historical records retain their
  original timestamps and are not represented as current activity.</li>
</ul>
<p>The detailed implementation methodology is available at
<a href="https://xcpdex.com/methodology">xcpdex.com/methodology</a>.</p>`
  );
}

function manifestResponse(request: Request): Response {
  const response = Response.json(
    {
      name: "Counterparty DEX market-data gateway",
      canonical_origin: `https://${PRIMARY_HOST}`,
      source: "settled Counterparty protocol activity on Bitcoin",
      interface: "https://xcpdex.com",
      organization: "https://counterparty.io",
      documentation: `https://${PRIMARY_HOST}/docs`,
      methodology: `https://${PRIMARY_HOST}/methodology`,
      status: `https://${PRIMARY_HOST}/status`,
      openapi: `https://${PRIMARY_HOST}/api/v1/openapi.json`,
      profiles: {
        coinmarketcap: {
          policy: "current and historical DEX data for assets CoinMarketCap already lists",
          summary: `https://${PRIMARY_HOST}/api/v1/coinmarketcap/summary`,
          assets: `https://${PRIMARY_HOST}/api/v1/coinmarketcap/assets`,
          ticker: `https://${PRIMARY_HOST}/api/v1/coinmarketcap/ticker`,
          orderbook_template: `https://${PRIMARY_HOST}/api/v1/coinmarketcap/orderbook/{market_pair}`,
          trades_template: `https://${PRIMARY_HOST}/api/v1/coinmarketcap/trades/{market_pair}`,
        },
        coingecko: {
          policy: "initial submission profile limited to XCP/BTC; additional assets require exact CoinGecko identity approval",
          tickers: `https://${PRIMARY_HOST}/api/v1/coingecko/tickers`,
        },
        defillama: {
          policy: "venue-wide BTC- and XCP-quoted settled volume",
          volume_template: `https://${PRIMARY_HOST}/api/v1/defillama/volume?start_timestamp={unix_seconds}&end_timestamp={unix_seconds}`,
        },
      },
    },
    {
      headers: {
        "cache-control": "public, max-age=300",
        ...securityHeaders,
      },
    }
  );
  return withoutBodyForHead(request, response);
}

function withGatewayHeaders(request: Request, upstreamResponse: Response): Response {
  const headers = new Headers(upstreamResponse.headers);
  headers.delete("set-cookie");
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  headers.set("x-counterwallet-gateway", "1");
  return new Response(request.method === "HEAD" ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

async function proxyApi(
  request: Request,
  env: Env,
  url: URL,
  upstreamPath: string
): Promise<Response> {
  const upstreamUrl = new URL(`${API_ORIGIN}${upstreamPath}${url.search}`);
  const headers = new Headers();
  for (const name of ["accept", "accept-encoding", "if-modified-since", "if-none-match", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstreamResponse = await env.XCPDEX_API.fetch(
      new Request(upstreamUrl, { method: request.method, headers })
    );

    if (upstreamPath !== "/openapi.json" || request.method !== "GET" || !upstreamResponse.ok) {
      return withGatewayHeaders(request, upstreamResponse);
    }

    const specification = (await upstreamResponse.json()) as Record<string, unknown>;
    specification.servers = [
      { url: `https://${PRIMARY_HOST}/api/v1`, description: "Official versioned gateway" },
      { url: `https://${PRIMARY_HOST}`, description: "Backward-compatible unversioned routes" },
    ];
    const info = specification.info;
    if (info && typeof info === "object" && !Array.isArray(info)) {
      const gatewayInfo = info as Record<string, unknown>;
      gatewayInfo.title = "Counterparty DEX Market Data API";
      gatewayInfo.description = `${String(gatewayInfo.description ?? "")} Official Counterwallet-domain distribution for settled Counterparty DEX market data.`.trim();
      gatewayInfo.contact = {
        name: "Counterparty",
        url: "https://counterparty.io",
      };
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-length");
    responseHeaders.set("content-type", "application/json; charset=utf-8");
    return withGatewayHeaders(
      request,
      new Response(JSON.stringify(specification), {
        status: upstreamResponse.status,
        headers: responseHeaders,
      })
    );
  } catch (error) {
    console.error({ event: "GATEWAY_UPSTREAM_FAILURE", upstream: upstreamUrl.toString(), error });
    return Response.json(
      { error: "market-data upstream unavailable" },
      {
        status: 502,
        headers: { "cache-control": "no-store", ...securityHeaders },
      }
    );
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeExternalUrl(value: unknown): string {
  if (typeof value !== "string") return "#";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? escapeHtml(url.toString()) : "#";
  } catch {
    return "#";
  }
}

async function upstreamJson(env: Env, path: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await env.XCPDEX_API.fetch(new Request(`${API_ORIGIN}${path}`));
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // The status page can still identify which dependency failed.
  }
  return { ok: response.ok, status: response.status, data };
}

interface StatusAsset {
  name?: string;
  unified_cryptoasset_id?: number;
  can_deposit?: boolean;
  can_withdraw?: boolean;
  network?: string;
  asset_url?: string;
}

interface StatusTicker {
  base_currency?: string;
  quote_currency?: string;
  last_price?: string;
  quote_volume?: string;
  isFrozen?: number;
  last_trade_timestamp?: number | null;
}

interface StatusCatalogMarket {
  ticker_id?: string;
  market_url?: string;
  consumers?: string[];
  status?: string;
  last_trade_timestamp?: number | null;
}

async function statusPageResponse(request: Request, env: Env): Promise<Response> {
  try {
    const [health, assetsResult, tickersResult, catalogResult] = await Promise.all([
      upstreamJson(env, "/status"),
      upstreamJson(env, "/coinmarketcap/assets"),
      upstreamJson(env, "/coinmarketcap/ticker"),
      upstreamJson(env, "/catalog/pairs"),
    ]);
    const healthData = health.data && typeof health.data === "object"
      ? health.data as Record<string, unknown>
      : {};
    const healthy = health.ok && healthData.ok === true && assetsResult.ok && tickersResult.ok && catalogResult.ok;
    const assets = assetsResult.data && typeof assetsResult.data === "object" && !Array.isArray(assetsResult.data)
      ? assetsResult.data as Record<string, StatusAsset>
      : {};
    const tickers = tickersResult.data && typeof tickersResult.data === "object" && !Array.isArray(tickersResult.data)
      ? tickersResult.data as Record<string, StatusTicker>
      : {};
    const catalog = Array.isArray(catalogResult.data)
      ? (catalogResult.data as StatusCatalogMarket[]).filter((row) => row.consumers?.includes("coinmarketcap"))
      : [];

    const assetRows = Object.entries(assets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([symbol, asset]) => `<tr>
        <td><a href="${safeExternalUrl(asset.asset_url)}">${escapeHtml(symbol)}</a></td>
        <td>${escapeHtml(asset.name ?? symbol)}</td>
        <td>${escapeHtml(asset.unified_cryptoasset_id ?? "—")}</td>
        <td>${escapeHtml(asset.network ?? "counterparty")}</td>
        <td>${asset.can_deposit && asset.can_withdraw ? "operational" : "limited"}</td>
      </tr>`).join("");
    const marketRows = catalog
      .filter((row): row is StatusCatalogMarket & { ticker_id: string } => typeof row.ticker_id === "string")
      .sort((a, b) => a.ticker_id.localeCompare(b.ticker_id))
      .map((market) => {
        const pair = market.ticker_id;
        const ticker = tickers[pair] ?? {};
        const base = ticker.base_currency ?? pair.split("_")[0];
        const quote = ticker.quote_currency ?? pair.split("_")[1];
        const marketUrl = market.market_url ?? `https://xcpdex.com/limit/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`;
        const timestamp = ticker.last_trade_timestamp ?? market.last_trade_timestamp;
        const lastTrade = typeof timestamp === "number"
          ? new Date(timestamp).toISOString()
          : "—";
        return `<tr>
          <td><a href="${safeExternalUrl(marketUrl)}">${escapeHtml(pair)}</a></td>
          <td>${ticker.isFrozen === 1 ? "historical / frozen" : escapeHtml(market.status ?? "active")}</td>
          <td>${escapeHtml(ticker.last_price ?? "—")}</td>
          <td>${escapeHtml(ticker.quote_volume ?? "0")} ${escapeHtml(quote)}</td>
          <td>${escapeHtml(lastTrade)}</td>
        </tr>`;
      }).join("");

    const mode = healthData.mode ?? "unknown";
    const lastBlock = healthData.indexer && typeof healthData.indexer === "object"
      ? (healthData.indexer as Record<string, unknown>).last_block_index ?? "—"
      : "—";
    return htmlResponse(
      request,
      "Counterparty DEX system status",
      `<h1>Counterparty DEX system status</h1>
<p class="${healthy ? "ok" : "bad"}"><strong>${healthy ? "Operational" : "Degraded"}</strong></p>
<p>Market-data API: ${health.status}; indexer mode: ${escapeHtml(mode)}; latest indexed block:
${escapeHtml(lastBlock)}. Checked ${escapeHtml(new Date().toISOString())}.</p>
<p class="muted">This page lists every asset and market in the CoinMarketCap submission profile.
Historical markets retain their original last-trade time and are labeled frozen; zero rolling volume
is not replaced with historical volume.</p>
<h2>Listed assets (${Object.keys(assets).length})</h2>
<div class="scroll"><table><thead><tr><th>Symbol</th><th>Name</th><th>CMC UCID</th><th>Network</th><th>Status</th></tr></thead>
<tbody>${assetRows || '<tr><td colspan="5">Asset data unavailable</td></tr>'}</tbody></table></div>
<h2>Listed markets (${catalog.length})</h2>
<div class="scroll"><table><thead><tr><th>Market</th><th>Status</th><th>Last price</th><th>24h quote volume</th><th>Last settlement (UTC)</th></tr></thead>
<tbody>${marketRows || '<tr><td colspan="5">Market data unavailable</td></tr>'}</tbody></table></div>
<p><a href="/status.json">Machine-readable health</a> · <a href="/docs">API documentation</a> ·
<a href="/methodology">Methodology</a></p>`,
      healthy ? 200 : 503,
      "no-store"
    );
  } catch (error) {
    console.error({ event: "GATEWAY_STATUS_FAILURE", error });
    return htmlResponse(
      request,
      "Counterparty DEX system status",
      `<h1>Counterparty DEX system status</h1><p class="bad"><strong>Unavailable</strong></p>
<p>The market-data service could not be reached. Checked ${escapeHtml(new Date().toISOString())}.</p>`,
      503,
      "no-store"
    );
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  const path = canonicalPath(url.pathname);
  const upstreamPath = resolveUpstreamApiPath(path);
  if (upstreamPath) {
    if (!API_METHODS.has(request.method)) return methodNotAllowed("GET, HEAD, OPTIONS");
    if (request.method === "OPTIONS") return optionsResponse();
    return proxyApi(request, env, url, upstreamPath);
  }

  if (path === "/.well-known/counterparty-market-data.json") {
    if (request.method === "OPTIONS") return optionsResponse();
    return request.method === "GET" || request.method === "HEAD"
      ? manifestResponse(request)
      : methodNotAllowed("GET, HEAD, OPTIONS");
  }
  if (path === "/" || path === "/market-data") {
    return request.method === "GET" || request.method === "HEAD"
      ? verificationPage(request)
      : methodNotAllowed();
  }
  if (path === "/docs") {
    return request.method === "GET" || request.method === "HEAD"
      ? documentationPage(request)
      : methodNotAllowed();
  }
  if (path === "/methodology" || path === "/market-data/methodology") {
    return request.method === "GET" || request.method === "HEAD"
      ? methodologyPage(request)
      : methodNotAllowed();
  }
  if (path === "/market-data/markets") {
    if (!API_METHODS.has(request.method)) return methodNotAllowed("GET, HEAD, OPTIONS");
    if (request.method === "OPTIONS") return optionsResponse();
    return proxyApi(request, env, url, "/catalog/pairs");
  }
  if (path === "/status" || path === "/market-data/status") {
    if (!API_METHODS.has(request.method)) return methodNotAllowed("GET, HEAD, OPTIONS");
    if (request.method === "OPTIONS") return optionsResponse();
    return statusPageResponse(request, env);
  }

  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  return withoutBodyForHead(
    request,
    Response.json(
      {
        error: "not found",
        docs: `https://${PRIMARY_HOST}/docs`,
        openapi: `https://${PRIMARY_HOST}/api/v1/openapi.json`,
      },
      { status: 404, headers: { "cache-control": "public, max-age=60", ...securityHeaders } }
    )
  );
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
