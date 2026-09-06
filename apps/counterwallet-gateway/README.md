# api.counterwallet.io gateway

This Cloudflare Pages project serves an official-domain Counterparty DEX
market-data surface at `api.counterwallet.io`. The parent domain remains on its
current Namecheap DNS and keeps its existing website redirect and mail records.

Pages Functions call the existing `xcpdex-api` Worker through a Cloudflare
service binding, so the gateway has no database, scheduled jobs, or duplicate
ingestion process. CoinMarketCap, CoinGecko, and DefiLlama retain separate named
adapters and may use different market-inclusion policies.

## Routing

| Request | Result |
| --- | --- |
| `/` | Short human-readable ownership, scope, and endpoint index. |
| `/docs` | Developer reference with request parameters and JSON response shapes. |
| `/methodology` | Reviewer-facing accounting methodology. |
| `/status` | Reviewer-facing system status with all CMC-profile assets and markets. |
| `/status.json`, `/api/v1/status` | Machine-readable indexer health and freshness. |
| `/coinmarketcap/*`, `/coingecko/*`, `/defillama/*`, `/catalog/pairs`, `/openapi.json` | Proxy the allowlisted adapter to `xcpdex-api`. |
| `/api/v1/...` | Stable alias for the same allowlisted upstream path. |
| `/market-data`, `/market-data/methodology`, `/market-data/markets`, `/market-data/status` | Backward-compatible reviewer routes. |
| `/.well-known/counterparty-market-data.json` | Machine-readable ownership and endpoint manifest. |
| Every other path | JSON `404` with links to the docs and OpenAPI document. |
| Unsupported methods | `405`. |

The exact API allowlist is `UPSTREAM_API_PATHS` in `src/index.ts`. A new upstream
route is not public on `api.counterwallet.io` until it is deliberately added.

## Checks

```sh
npm run check --workspace counterwallet-gateway
```

`build:pages` compiles the catch-all Pages Function without creating a remote
project or deployment.

## Deployment

The first deployment requires a Pages project named `counterwallet-api` in the
same Cloudflare account as the `xcpdex-api` Worker. The checked-in Wrangler
configuration binds that Worker as `XCPDEX_API`.

```sh
npm run deploy:pages --workspace counterwallet-gateway
```

After the deployment exists, add `api.counterwallet.io` under the Pages
project's **Custom domains** screen. Only then should the domain owner create a
Namecheap CNAME from host `api` to `counterwallet-api.pages.dev`. Cloudflare will
provision TLS for the custom hostname.

The complete owner handoff, verification, and rollback procedure is in
[`../../docs/counterwallet-dns-cutover.md`](../../docs/counterwallet-dns-cutover.md).
