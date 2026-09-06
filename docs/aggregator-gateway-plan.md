# Counterwallet market-data gateway and aggregator submission plan

Last reviewed: 2026-09-02

Implementation status: the Pages gateway is deployed at
`https://counterwallet-api.pages.dev`, and Cloudflare has registered the custom
hostname. It is pending Adam's `api → counterwallet-api.pages.dev` CNAME. The
new CMC API additions are deployed on `xcpdex-api`, and every documented gateway
surface returns successfully through the Pages hostname. Submission remains
gated on the data-quality review and the subdomain handoff.

## Decision

Use `api.counterwallet.io` as the official market-data trust anchor. Serve a
small, versioned API plus human-readable verification, methodology, status, and
supported-market pages from that subdomain. Leave the `counterwallet.io` apex,
its redirect, mail, nameservers, and DNSSEC under Adam's existing management.

Do not submit until Adam's CNAME is live and the production verification pass
is complete. The CMC package is otherwise implemented; CoinGecko still needs an
explicit decision on non-EVM asset identifiers and symbol collisions.

For CoinMarketCap, the product is a **curated current-and-historical DEX data
feed for assets CMC already lists**. Counterparty has many additional markets,
but they are deliberately excluded because CMC does not list the underlying
assets. CMC recognition controls feed membership; current activity controls the
market's live/inactive status. Historical trades remain queryable with their
original timestamps, while an old last price must not be presented ambiguously
as a current executable market.

## What the official requirements say

### CoinMarketCap

The current [Listings Criteria](https://support.coinmarketcap.com/hc/en-us/articles/360043659351-Listings-Criteria/)
requires a functional site whose volume matches its API, a public summary feed,
at least 60 days of operation, visible markets/order books without login,
unambiguous direct asset URLs, and a reachable representative. Requests from an
email domain shared with the exchange are explicitly prioritized. CMC also says
its online form is the only submission channel.

The linked [Ideal API Endpoint](https://docs.google.com/document/d/1S4urpzUnO2t7DmS_1dc4EL4tgnnbTObPYXvDeBnukCg/edit)
is stricter than the criteria summary. It calls summary, assets, ticker, full
level-2 order book, and recent-trades endpoints mandatory; requires public JSON
without authentication or pagination; expects one-minute polling, pair
delimiters, API versioning, gzip support, and no regional or Cloudflare blocks.

CMC's methodology evaluates more than schema compliance: liquidity, reported
volume legitimacy, time-and-sales consistency, traffic, longevity, reputation,
and other qualitative evidence. Live trade and order-book data are necessary
for data to contribute to volume-weighted prices and adjusted volume.

### CoinGecko

CoinGecko's current [listing methodology](https://www.coingecko.com/en/methodology)
requires a working exchange site whose displayed volume matches the API, the
CoinGecko API standard, public REST documentation, a reachable representative,
and coin-information pages identifying each asset.

Its [Spot Exchange API standard](https://docs.google.com/document/d/1v27QFoQq1SKT3Priq3aqPgB70Xd_PnDzbOCiuoCyixw/edit)
requires public unauthenticated JSON that can be polled at least minutely. For a
spot DEX, `/tickers` must identify the pair and pool and report price and
single-sided 24-hour volumes. Order-book DEXes provide at least 100 levels (50
per side when available). AMM DEXes report `liquidity_in_usd` and provide their
depth formula; historical trades are optional but strongly useful.

Counterparty has no EVM factory/router address, so its public API documentation
is required under CoinGecko's [new exchange guidance](https://support.coingecko.com/hc/en-us/articles/31989910472345-How-to-Add-a-New-Exchange-on-CoinGecko).
It should be submitted as a **Decentralized Spot Exchange**, not as an OTC/P2P
venue. CoinGecko currently lists unsupported P2P/OTC models as a possible reason
for rejection even though protocol-native DEX settlement is supported.

## Current-state audit

Live audit on 2026-09-02:

| Area | Current state | Submission impact |
| --- | --- | --- |
| CMC venue identity | Counterparty DEX already has an untracked CMC page whose website is `counterwallet.io`. | Strong basis for an **existing exchange API update**, not a new exchange application. |
| CMC feed | The CMC-specific profile has 17 current-or-historical pairs and complete summary, assets, ticker, order-book, and trades routes. | Matches the linked CMC technical sample; production verification remains before submission. |
| CMC roster provenance | The deployed code at audit time described its allowlist as top “currency-like” assets by all-time order-book trades. | The prepared implementation now uses a separate CMC profile with verified UCIDs and excludes `MAGICFLDC` and the unrelated `BITCORN` collision; see `coinmarketcap-asset-map.md`. Reconfirm this map in the submission package. |
| Book quality | The audit found `XCP_BTC` crossed because uncommitted BTC-side order intents were being treated as executable depth. | Fixed in the prepared API: every BTC-quoted book excludes open DEX orders, completed BTCPays remain settled trades, and escrow-backed dispensers remain asks. One-sided historical markets are disclosed rather than padded. |
| Staleness | 11/18 published markets have no completed trade in 90 days. Some may intentionally be CMC-recognized historical markets. | Not itself a roster error. It becomes a feed error only if historical rows are represented as currently active or their old price is interpreted as current. CoinGecko separately excludes inactive tickers from calculations. |
| CoinGecko schema | Ticker, order-book, and historical-trades routes are close to the standard. | Good base implementation. |
| AMM disclosure | Three published pairs currently have pools. | Fixed in the prepared API: AMM ticker rows include reserve-based `liquidity_in_usd`; public methodology documents `x*y=k`, XCP.io USD anchors, and Counterparty's 50/100 bps input-fee schedule. |
| Asset identity | Tickers use symbols. The catalog links to canonical Counterparty explorer pages but does not publish Counterparty numeric asset IDs. | Collision risk: symbols such as PEPECASH and BITCORN also identify unrelated assets on other chains. |
| Website verification | `xcpdex.com` has public order books, an explorer, and methodology. | Fixed in the prepared gateway: catalog links go directly to visible limit books, and `/status` lists every CMC-profile asset and market with status and direct links. |
| OpenAPI identity | The spec advertises `api.xcpdex.com` and a `droplister.com` contact. The prototype gateway only rewrites `servers`. | The official-domain version needs its own title, ownership statement, official contact, and Counterparty links. |
| Access and caching | Endpoints are unauthenticated JSON and accept CoinGecko's documented headers. Fresh cache misses advertise 60-second caching. | Good, but add continuous probes so an old cached object, WAF rule, or challenge cannot silently violate polling requirements. |

## Options

### Option A — Identity-only gateway

Serve only the existing summary/ticker endpoints and OpenAPI document on
`api.counterwallet.io`.

- Fastest path and enough to test CMC's domain-verification hypothesis.
- High rejection risk because it leaves the crossed book, one-sided rows, CMC
  endpoint completeness, AMM liquidity, and visible-data proof unresolved.
- Suitable only for asking CMC whether the official domain is recognized, not
  for the final API-update submission.

### Option B — CMC-listed current-and-historical feed (recommended)

Publish current market data and timestamped historical DEX data only for assets
CMC already lists. Give each market an explicit active, inactive, frozen, or
historical status. Give the currently active subset complete live-market
representations, exact asset identity, direct public market pages, and documented
accounting/depth rules. Explicitly disclose that other Counterparty markets were
excluded only because their assets are outside CMC's catalog.

- Best reviewer story: the official feed mirrors CMC's existing Counterparty
  coverage without pretending the protocol's 12,000+ long tail is supported or
  that every recognized legacy market is live today.
- Implemented in the prepared API and gateway; the remaining gate is production
  verification on the official hostname.
- Lets the long-tail explorer remain comprehensive while the aggregator feed
  remains conservative and defensible.

### Option C — Full protocol-market firehose

Expose every market ever created and let aggregators filter it.

- Most literal reading of “all markets.”
- Poor fit for no-pagination requirements, asset-identity review, low activity,
  one-sided books, and manual pair mapping.
- Likely to lower confidence and obscure the few markets that are actually
  reviewable. Not recommended for the first integration.

## Recommended gateway surface

Serve these paths on `https://api.counterwallet.io`. The root and `/docs` are
the reviewer-facing index; unknown paths return a useful API `404`. The parent
site continues its existing redirect independently. Unsupported methods return
`405`.

| Purpose | Recommended path |
| --- | --- |
| Human ownership, verification, and endpoint index | `/` |
| Developer reference and JSON response shapes | `/docs` |
| Machine-readable ownership manifest | `/.well-known/counterparty-market-data.json` |
| Methodology, including source-by-source accounting and pool math | `/methodology` |
| Live health, freshness, and indexed block | `/status` |
| Exact supported-market and asset-identity table | `/market-data/markets` |
| Official OpenAPI document | `/api/v1/openapi.json` |
| CMC summary | `/api/v1/coinmarketcap/summary` |
| CMC assets | `/api/v1/coinmarketcap/assets` |
| CMC ticker | `/api/v1/coinmarketcap/ticker` |
| CMC level-2 book | `/api/v1/coinmarketcap/orderbook/{market_pair}` |
| CMC recent trades | `/api/v1/coinmarketcap/trades/{market_pair}` |
| CoinGecko tickers | `/api/v1/coingecko/tickers` |
| CoinGecko order book | `/api/v1/coingecko/orderbook?ticker_id=...&depth=100` |
| CoinGecko historical trades | `/api/v1/coingecko/historical_trades?ticker_id=...` |

CMC presentation should be status-aware:

- `/assets` and `/market-data/markets` contain the entire verified
  CMC-recognized roster, including historical assets.
- `/ticker` may retain inactive/historical market records with the standard
  frozen/inactive signal where supported.
- `/summary` contains currently active markets unless CMC explicitly confirms
  that it wants historical rows there. The CMC summary schema has no reliable
  standard field for staleness, so a custom `is_stale` flag alone is not enough
  protection against an old `last_price` being treated as live.
- Volume is always rolling settled volume for the requested window; historical
  status never licenses synthetic, lifetime, or carry-forward volume.

The gateway should call `xcpdex-api` through a Cloudflare service binding. It
must not duplicate D1, indexers, cron jobs, or market accounting. Aggregator
adapters should be thin presentations of one canonical market-data model.

This does **not** mean one shared public endpoint or one shared market allowlist.
Keep the original separately named adapters because each consumer has a
different schema, unit convention, activity rule, and useful market universe:

| Consumer | Public adapter | Inclusion profile |
| --- | --- | --- |
| CoinMarketCap | `/api/v1/coinmarketcap/*` | Current and historical DEX data only for assets CMC already lists. |
| CoinGecko | `/api/v1/coingecko/*` | Initial submission profile: `XCP_BTC` only. Expand only after CoinGecko approves exact identities for additional Counterparty assets. |
| DefiLlama | Its own named adapter/export | The broader XCP/BTC lens already accepted by DefiLlama, with the option to expand independently to more Counterparty markets. |

Share source facts—asset identity, settled trades, rolling volumes, book levels,
pool reserves, timestamps, and fee math. Apply consumer-specific filtering and
serialization only at the adapter boundary. This prevents inconsistent prices
or double-counted volume without forcing an aggregator to consume another
aggregator's format or curation policy.

## Delivery plan and acceptance gates

### 1. Lock the market and accounting definitions

- Build an authoritative mapping for every intended row: Counterparty numeric
  asset ID, exact CMC listing/ID, whether CMC currently or historically lists it,
  supported quote pairs, and evidence URL. The roster must come from this map,
  not an all-time-volume heuristic.
- Define two separate booleans: `cmc_recognized` controls catalog membership;
  `live_market_eligible` requires a recent completed settlement, visible public
  page, and defensible current liquidity. Preserve the historical status instead
  of deleting recognized legacy entries.
- Exclude conditional BTC-side order intents from published depth. A BTC order
  match enters trades, price, and volume only after its separate BTCPay
  completes; escrow-backed dispenser inventory remains executable ask depth.
- Keep completed orders, pool fills, and dispenser executions separately
  auditable while avoiding double-counting.
- Publish Counterparty numeric asset ID, symbol, longname, divisibility, network,
  explorer URL, and any external CMC/CG identifier. Never map by symbol alone.

**Gate:** no crossed books, no nonpositive prices, no duplicate trade IDs, and
no mandatory numeric field containing `null` for a submitted market.

### 2. Complete the adapters

- Add the remaining CMC assets, ticker, book, and trades representations.
- Keep timestamps in the units each standard requests (CMC milliseconds;
  CoinGecko trade timestamps seconds and order-book timestamps milliseconds).
- For every AMM row, expose pool ID, base/target reserves, `liquidity_in_usd`,
  AMM type, and fee basis points. Document Counterparty's constant-product math,
  integer rounding, hybrid book routing, and the current fee schedule (50 bps
  for XCP pairs, 100 bps otherwise).
- Make the official OpenAPI document describe `api.counterwallet.io`, Counterparty
  ownership, the exact supported-market policy, and an official contact.
- Preserve unknown extra audit fields only if the aggregator parser tolerates
  them; otherwise expose them through a separate audit endpoint.

**Gate:** schema fixtures from both official samples pass; a reconciliation job
proves the two adapters, historical trades, book tops, and website figures all
come from the same source data.

### 3. Build the verification surface

- `/` and `/docs` state that Counterparty operates/authorizes the feed and that
  XCP DEX is the current interface for the protocol-native Counterparty DEX.
- `/market-data/markets` shows the same last price, rolling 24-hour volumes,
  bid/ask, last trade time, asset names/logos, and direct book/trade links that
  the API exposes.
- Explain that the venue is a decentralized spot exchange on Bitcoin. Avoid
  categorizing it as an OTC or unsupported P2P exchange.
- Link the Counterparty Core release/specification proving the protocol's
  order-book and constant-product AMM behavior.

**Gate:** a reviewer can verify every submitted API row in a browser without
connecting a wallet or logging in.

### 4. Prepare Cloudflare Pages and the subdomain safely

- Deploy the Pages project in the same Cloudflare account as `xcpdex-api` and
  verify the Pages hostname plus service binding first.
- Associate `api.counterwallet.io` in the Pages project's Custom domains screen
  before asking Adam to create the external-DNS CNAME.
- Adam adds only `CNAME api → <exact-project>.pages.dev` in Namecheap. Do not
  change nameservers, DNSSEC, apex, mail, or any unrelated record.
- Exempt `/api/v1/*` and the well-known manifest from browser challenges and
  bot/WAF rules. Keep reasonable abuse limits but do not require IP allowlisting.
- Probe from more than one region with CMC- and CoinGecko-like headers.

**Gate:** valid TLS, no challenge/cookie/authentication, gzip available, stable
JSON, 60-second freshness, and unchanged apex and mail behavior.

### 5. Soak before submission

Run the completed surface for at least 14 days; 30 days gives a stronger
operational record. Monitor availability, response time, indexed-block lag,
last successful refresh, schema drift, WAF responses, crossed books, and
reconciliation failures.

**Gate:** no unexplained 4xx/5xx, no challenge responses, current status
timestamps, and a saved compliance report covering every published pair.

### 6. Submit two distinct packages

**CoinMarketCap:** use the existing-exchange update form for Counterparty DEX.
Adam should submit it from an exact official-domain address if one is available
(ideally `@counterwallet.io`; otherwise explain the relationship to
`@counterparty.io`). Include the official verification page, versioned CMC
endpoints, direct market/status/methodology links, launch history, and a concise
description of the data sources. Use this pitch: **“This feed provides current
and historical Counterparty DEX trading data for assets CoinMarketCap already
lists. Counterparty supports additional markets, which we deliberately exclude
from this integration because their underlying assets are not listed by
CoinMarketCap.”** Status and timestamps distinguish current from historical
coverage. An ordinary email can support a ticket, but it does not replace CMC's
required form.

**CoinGecko:** use the Partners Platform's new **Decentralized Spot Exchange**
request. Include the CoinGecko-specific routes, public OpenAPI document, AMM
formula/liquidity fields, exact non-EVM asset identities, and representative.
If the prior outreach was an email rather than a Partners request, treat it as
not submitted. If a request was rejected, follow the portal remark before one
clean resubmission rather than creating duplicates.

## Known versus reviewer-dependent

Known:

- CMC already associates Counterparty DEX with `counterwallet.io` and currently
  shows it as untracked with no volume.
- Exact-domain submission improves CMC priority, but the official form is still
  mandatory.
- CoinGecko does not currently integrate Counterparty DEX and requires API docs
  because there is no compatible factory/router address.
- Historical/stale membership can be intentional for the CMC compatibility
  roster; it is not equivalent to current trading activity.
- The prepared CMC feed encodes UCIDs and frozen status, retains genuine zero
  rolling volume on historical rows, excludes uncommitted BTC-order depth, and
  implements the complete CMC surface. The prepared CoinGecko feed adds AMM USD
  liquidity, but its final asset identity/profile decision is still open.

Reviewer-dependent:

- Whether CMC wants recognized historical markets omitted from `/summary`, or
  retained there with zero rolling volume and an agreed inactive treatment.
- How CMC will score zero platform trading fees versus Counterparty pool fees
  and Bitcoin miner fees.
- How CoinGecko wants Counterparty numeric asset and LP-token IDs encoded in a
  schema whose DEX examples assume contract addresses.
- Whether symbols that collide with assets on other chains can be mapped to
  existing listings or require new/updated asset records first.

These should be presented as explicit integration questions in the submission,
not guessed in code.
