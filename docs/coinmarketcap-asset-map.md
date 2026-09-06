# CoinMarketCap asset mapping for the Counterparty DEX feed

Last verified: 2026-09-02

The CoinMarketCap adapter is intentionally limited to Counterparty DEX markets
whose underlying assets already have a CoinMarketCap Unified Cryptoasset ID
(UCID). The exchange-facing code may differ from CMC's display ticker after a
migration; the UCID is the identity anchor.

| Counterparty/exchange code | CMC display code | UCID | CMC identity page | Note |
| --- | --- | ---: | --- | --- |
| `BTC` | `BTC` | 1 | <https://coinmarketcap.com/currencies/bitcoin/> | Quote asset. |
| `XCP` | `XCP` | 132 | <https://coinmarketcap.com/currencies/counterparty/> | Counterparty native asset. |
| `PEPECASH` | `PEPECASH` | 1405 | <https://coinmarketcap.com/currencies/pepe-cash/> | Original Counterparty Pepe Cash identity. Do not map to `pepecash-eth` UCID 36656. |
| `BITCRYSTALS` | `BCY` | 1063 | <https://coinmarketcap.com/currencies/bitcrystals/> | Exchange code is the Counterparty asset name. |
| `SCOTCOIN` | `SCOT` | 346 | <https://coinmarketcap.com/currencies/scotcoin/> | Exchange code is the Counterparty asset name. |
| `SJCX` | `SJCX` | 549 | <https://coinmarketcap.com/currencies/storjcoin-x/> | Historical Storjcoin X identity. |
| `LTBCOIN` | `LTBC` | 550 | <https://coinmarketcap.com/currencies/ltbcoin/> | Exchange code is the Counterparty asset name. |
| `FLDC` | `FLDC` | 606 | <https://coinmarketcap.com/currencies/foldingcoin/> | Historical/preview identity. |
| `ZAIF` | `ZAIF` | 1219 | <https://coinmarketcap.com/currencies/zaif/> | Historical/preview identity. |
| `RUSTBITS` | `RUSTBITS` | 1870 | <https://coinmarketcap.com/currencies/rustbits/> | Historical/preview identity. |

## Explicit exclusions from the CMC adapter

| Counterparty asset | Reason |
| --- | --- |
| `MAGICFLDC` | No matching CoinMarketCap currency identity/UCID was verified. |
| `BITCORN` | CoinMarketCap's <https://coinmarketcap.com/currencies/bitcorn/> is `CORN` (UCID 12779), a different asset. Mapping Counterparty `BITCORN` to it would be an identity collision. |

These exclusions apply only to `/coinmarketcap/*`. They do not remove the
markets from XCP DEX, the explorer, CoinGecko's separately controlled candidate
profile, or DefiLlama's broader BTC/XCP venue-volume calculation.

## Change rule

To add a CMC market:

1. Verify the exact CMC identity page and UCID.
2. Confirm that the page represents the same underlying Counterparty asset or a
   documented migration of that asset—not merely a matching symbol/name.
3. Add the UCID to `CMC_ASSET_IDS` in
   `apps/api/src/routes/coinmarketcap.ts`.
4. Add the pair to `COINMARKETCAP_PAIRS` in
   `apps/api/src/lib/market-summary.ts`.
5. Update this table and run the API/gateway checks.

The adapter deliberately throws if a CMC-profile asset lacks a UCID, preventing
future market additions from silently falling back to symbol matching.
