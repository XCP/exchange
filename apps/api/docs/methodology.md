# Market Data Methodology

XCP DEX is the modern trading interface and market-data service for the Counterparty DEX, a
protocol-native spot venue on Bitcoin. XCP.io provides the underlying explorer and indexing
infrastructure; both properties are operated by the same team and read the same indexed
Counterparty and Bitcoin settlement data. This page defines exactly what the numbers at
`api.xcpdex.com` mean.

## Venue definition

The feed reports **completed spot executions** from three protocol-native mechanisms:

1. **Order-book settlements** — Counterparty order matches that reached `completed` status.
   Order matches involving BTC remain `pending` until the required BTCPay confirms; pending
   matches are never counted, and a match that expires unpaid never enters the feed.
2. **AMM pool fills** — completed Counterparty pool matches.
3. **Dispenser executions** — BTC-denominated purchases from Counterparty dispensers, on
   BTC-quoted pairs only. A dispenser is a protocol object escrowing an asset and dispensing it
   at a fixed satoshi rate to whoever pays its address: a genuine, executable, on-chain
   fixed-price offer.

**PSBT/UTXO swaps are currently excluded.** They are a separate settlement mechanism and will
only be added with their own trade-ID namespace (code 3, already reserved) and a precise
execution definition.

Markets are an explicit allowlist (`/catalog/pairs`), not everything the protocol has ever
traded. Each entry declares which execution sources actually feed it.

That allowlist applies to the CoinGecko and CoinMarketCap feeds. The DefiLlama volume endpoint
is venue-wide: it includes every non-hidden Counterparty market whose executed quote asset is
BTC or XCP. This includes long-tail base assets without assigning them speculative prices;
the endpoint returns native BTC and XCP quote balances for DefiLlama to price historically.
Direct order-book self-matches, where the indexed maker and taker Bitcoin addresses are equal,
are excluded as wash trading. Different-address executions are not removed without evidence
that the addresses share an owner.

`/defillama/volume` accepts an exact half-open Unix-second window: `start_timestamp` is
inclusive and `end_timestamp` is exclusive. If the indexer has not completed the requested
window, the endpoint returns HTTP 503 rather than partial data or a placeholder zero.
Finalized historical responses are cached at the edge, and the endpoint performs no database
writes.

## Dispenser accounting

This is the unusual part of the venue, so it is stated precisely:

> **Dispenser price and quote volume are calculated from the dispenser's protocol-defined
> satoshi rate and the quantity actually dispensed — protocol-priced notional. The gross
> Bitcoin payment is never treated as market notional**, because one Bitcoin payment can
> trigger dispensers for several different assets at the same address (the protocol stamps the
> full payment on every resulting dispense record), and because a payment can exceed the exact
> protocol price. Counting gross payments would duplicate and inflate quote volume; counting
> protocol notional cannot.

Dispenser-backed liquidity contributes **asks only** (a dispenser is a standing sell offer);
order-book bids are the only bids. On the order book endpoint, open dispensers with escrow
remaining appear as ask levels alongside order-book asks.

## Prices, quantities, and staleness

- Unit **prices** are arbitrary-precision, non-scientific decimal strings. Sub-satoshi unit
  prices are real on this venue (1 satoshi for 1,000 units = `0.00000000001`), so prices are
  not truncated to eight decimals.
- Asset **quantities and volumes** are fixed 8-decimal strings (Counterparty divisible-asset
  precision).
- **`last_price` always comes from a completed settlement.** An open bid or ask is never
  promoted into `last_price`. Where a market's last completed settlement is old, the price
  remains visible and is labeled: `is_stale` is true when no settlement occurred within the
  last **90 days**, and `last_trade_timestamp` carries the settlement's Bitcoin block time.
- A nonzero execution is never published with a zero price; such rows are dropped and logged.

## The 24-hour window

All 24-hour figures use a **rolling window** — request time minus 24 hours through request
time — not a UTC calendar day. Inclusion is governed by the **Bitcoin block time of the
confirming block** for every source (order match completion, pool fill, dispense). When no
settlement occurred in the window, volumes are `0.00000000` and high/low fall back to
`last_price`.

## Trade identity

Every published fill carries a permanent unique integer:

```
trade_id = source_id × 8 + source_code

0 = order-book settlement
1 = AMM pool fill
2 = dispenser execution
3 = reserved for PSBT/UTXO swaps
```

Fills are only ever appended under protocol-derived unique keys (order-match identity;
transaction hash plus dispense index), so an ID never changes or repeats. Each fill also
carries `source` and `settlement_txid`, so any number in the feed can be verified against the
Bitcoin blockchain directly.

## Verification

A reconciliation gate runs against the live API before any aggregator submission and after any
accounting change. It requires: CoinMarketCap and CoinGecko responses equal field-for-field;
ticker bid/ask equal to the order book's top levels; ticker volumes, high, low, and last price
equal to the full rolling-24h historical window (paged exhaustively); no duplicate trade IDs;
no nonpositive prices; sorted books; and stale flags consistent with the 90-day rule.

The accounting rules above are additionally locked by regression tests, including a fixture
reproducing a real observed pathology: one Bitcoin output triggering twenty dispensers, where
the venue must book twenty protocol-priced notionals rather than twenty copies of the payment.

- API reference: [`api.xcpdex.com/openapi.json`](https://api.xcpdex.com/openapi.json)
- Market catalog: [`api.xcpdex.com/catalog/pairs`](https://api.xcpdex.com/catalog/pairs)
- Contact: `dan@droplister.com`
