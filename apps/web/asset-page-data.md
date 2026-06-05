# Everything We Can Know About an Asset

Using PEPECASH as the reference. Sources: our D1 database, Counterparty API, xcp.io, derived.

---

## 1. IDENTITY

| Data | Source | PEPECASH Example |
|------|--------|------------------|
| Symbol | CP API / `assets` table | `PEPECASH` |
| Numeric asset ID | CP API | `121892899915` |
| Longname (subassets) | CP API / `assets` table | null |
| Description text | CP API | `http://rarepepedirectory.com/json/pc.json` |
| Description locked? | CP API / `assets` table | No |
| MIME type | CP API | `text/plain` |
| JSON metadata (if desc is URL) | Fetched client-side | `{ name: "Pepe Cash", image, image_large, attributes... }` |
| Collection membership | `tags` + `tag_assets` tables | Rare Pepe |
| Other tag memberships | `tags` table (tokenscan, pepewtf, stampchain, scannable, kaleidoscope) | — |
| Image (icon 14px) | `app.xcp.io/img/icon/{ASSET}` | small icon |
| Image (full ~400x560) | `app.xcp.io/img/full/{ASSET}` | card art |

## 2. ISSUANCE & SUPPLY

| Data | Source | PEPECASH Example |
|------|--------|------------------|
| Total supply | CP API / `assets` table | 995,273,182 |
| Divisible | CP API / `assets` table | Yes |
| Locked (supply immutable) | CP API / `assets` table | Yes |
| Issuer address | CP API / `assets` table | `1GQha...` |
| Owner address | CP API / `assets` table | `1GQha...` (same = never transferred) |
| First issuance block | CP API / `assets` table | #430,263 |
| First issuance time | CP API / `assets` table | Sep 17, 2016 |
| Last issuance block | CP API | #431,786 (lock event) |
| Last issuance time | CP API | Sep 27, 2016 |
| Fee paid to create | CP API issuances | 0.50 BTC |
| **Issuance history** | CP API `/assets/{asset}/issuances` | 3 events: creation → description change → lock |
| **Subasset count** | CP API `/assets?asset_longname=X.%` | could query (PEPECASH has subassets?) |

## 3. HOLDER DISTRIBUTION

| Data | Source | PEPECASH Example |
|------|--------|------------------|
| Top 30 holders | CP API `/assets/{asset}/balances` | address, balance, % supply |
| Total holder count | CP API (result_count) | 7,816 |
| Burn address detection | Our code (BURN_ADDRESSES list) | `1BurnP...K33R` tagged |
| **Destruction count** | CP API `/assets/{asset}/destructions` | **1,947 burn events** |
| **Total burned supply** | Derivable from destructions | sum of all destruction quantities |
| **Concentration** | Derivable | top 10 holders = X% of supply |
| **Burn rate** | Derivable | % of original supply destroyed |

## 4. TRANSFER ACTIVITY

| Data | Source | PEPECASH Example |
|------|--------|------------------|
| **Total send count** | CP API `/assets/{asset}/sends` | **28,525 transfers** |
| Recent sends | CP API (with pagination) | individual send txs with source, dest, qty, block |
| **Dividend history** | CP API `/assets/{asset}/dividends` | 0 dividends for PEPECASH |

## 5. DEX TRADING (our DB)

### Per-Pair Stats (from `pair_stats` table)

| Data | Available per pair |
|------|-------------------|
| Last price, last trade time, last side | Yes |
| Price change 24h/7d/30d | Yes |
| Volume 24h/7d/30d (quote-denominated) | Yes |
| Base volume 24h/7d/30d (base-denominated) | Yes |
| High/low 24h/7d/30d | Yes |
| Trade count 24h/7d/30d | Yes |
| Total volume (all-time) | Yes |
| Total base volume (all-time) | Yes |
| Total trade count (all-time) | Yes |
| Unique traders (all-time) | Yes |
| All-time high / all-time low | Yes |
| Open orders count | Yes |
| Bid count / ask count | Yes |
| Best bid / best ask / spread | Yes |
| First trade time | Yes |

### As Base Asset (sell PEPECASH for X)
- **54 pairs** where PEPECASH is base
- Top: PEPECASH/XCP (9,400 trades, 26,843 XCP volume), PEPECASH/BTC (33 trades)

### As Quote Asset (use PEPECASH as currency)
- **2,073 pairs** where PEPECASH is quote currency!
- PEPECASH is a **major ecosystem currency** — 3rd largest quote by pair count after XCP and BTC
- Top: CSAT/PEPECASH (268 trades), HANNIBALPEPE/PEPECASH (105 trades)

### Individual Trades (from `trades` table)
| Data | Available |
|------|-----------|
| Every trade: match_id, pair, price, amount, volume, side, maker, taker, block, time, tx hashes | Yes |
| **Top makers per asset** | Queryable: `SELECT maker, COUNT(*), SUM(volume) FROM trades WHERE base_asset=? GROUP BY maker` |
| **Top takers per asset** | Same pattern |
| **Largest trades** | Queryable: `ORDER BY volume DESC` |
| **Recent trades** | Already have `/trades/{pair}` endpoint |

### Buy/Sell Pressure (from `/asset/{asset}` endpoint)
| Data | PEPECASH |
|------|----------|
| Buy pressure (total bid volume) | 12,197,414 |
| Sell pressure (total ask volume) | 242,622 |
| Net pressure | +11,954,792 |
| Pressure ratio | 50.3x buy-heavy |
| Total open orders | 124 |
| Pairs with open orders | 89 |
| Last trade (pair, price, amount, side) | PEPECASH/XCP @ 0.00244444 (sell) 4,500 |

### Order History (from `orders` table)
| Data | Available |
|------|-----------|
| All historical orders | tx_hash, pair, side, price, amount, status, block, source |
| Open/filled/expired/cancelled breakdown | Filterable by status |
| **Order frequency** | Queryable by time windows |

## 6. DISPENSERS (our DB)

### Aggregate Stats (from `dispenser_stats` table)
| Data | PEPECASH |
|------|----------|
| Total BTC spent (all-time) | 74.51 BTC |
| Total units dispensed | 114,351,422 |
| Total dispense count | 5,272 |
| Unique buyers | 1,634 |
| Unique sellers | 823 |
| Dispensers ever created | 2,002 |
| Avg BTC per dispense | 0.0141 BTC |
| Active dispensers | 54 |
| Total available supply in dispensers | 6,221,759 |
| Cheapest active dispenser | 0.0000001 BTC |
| Rolling volume/count/high/low 24h/7d/30d | Yes |
| Price change 24h/7d/30d | Yes |
| First dispense time | Feb 2020 |

### Individual Dispensers (from `dispensers` table)
| Data | Available |
|------|-----------|
| Each dispenser: tx_hash, source, price, qty, remaining, status, block, time | Yes |
| Oracle address (if oracle-priced) | Yes |
| Dispense count per dispenser | Yes |
| Created time / closed time | Yes |

### Individual Dispenses (from `dispenses` table)
| Data | Available |
|------|-----------|
| Each dispense: tx, source (seller), destination (buyer), qty, btc_amount, price, block, time | Yes |
| **Top buyers** | Queryable: `SELECT destination, COUNT(*), SUM(btc_amount) FROM dispenses WHERE asset=? GROUP BY destination` |
| **Top sellers** | Queryable: same with `source` |
| **Largest single dispense** | Queryable: `ORDER BY btc_amount DESC` |

## 7. ATOMIC SWAPS (from `swap_listings` table)
| Data | Available |
|------|-----------|
| Active listings: seller, qty, price_sats, status, created, expires | Yes |
| Historical fills: buyer, tx_id, broadcast_txid | Yes |

## 8. DEAL SCORES (from `deal_scores` table)
| Data | Available per quote currency |
|------|-----|
| Fair value (median of last 10 trades) | Yes |
| Last/highest/lowest/average/median price | Yes |
| Recent sales JSON (last 5 trades) | Yes |
| Cheapest listing (price, type order/dispenser, qty) | Yes |
| Discount % vs fair value | Yes |
| Dispenser context (cheapest BTC, last BTC price, active, unique buyers) | Yes |
| Total trades, avg days between trades, days since last trade | Yes |
| Active buy orders, unique traders | Yes |
| Score (0-100 deal quality) | Yes |
| Score confidence (LOW/MED/HIGH) | Yes |
| Warning flags JSON | Yes |
| Collections JSON | Yes |
| Market total qty & listing count | Yes |

## 9. ACTIVITY TIMELINE (from our `/asset/{asset}/activity` endpoint)
| Data | Available |
|------|-----------|
| Daily count of trades + dispenses | Yes, from first activity to present |
| PEPECASH: Sep 2016 → present, peaks of 90+ events/day | |

## 10. CANDLE DATA (from `candles` table)
| Data | Available per pair |
|------|-----------|
| OHLCV candles at 1H/4H/1D/1W/1M/1Y intervals | Yes |
| Buy volume vs sell volume per candle | Yes |
| Trade count per candle | Yes |

---

## WHAT'S NOT SURFACED YET (could derive or add endpoints)

| Idea | How |
|------|-----|
| **Top traders for this asset** | Query `trades` table: `GROUP BY maker/taker WHERE base_asset=? OR quote_asset=?` |
| **Top dispenser buyers** | Query `dispenses` table: `GROUP BY destination WHERE asset=?` |
| **Largest trades ever** | Query `trades` ORDER BY volume DESC |
| **Market cap** | supply × price (pick most liquid pair or dispenser price) |
| **Market cap in BTC** | supply × BTC price per unit |
| **Fully diluted vs circulating** | total supply minus burned supply |
| **Burn rate** | destructions count / total supply, or burned qty / original supply |
| **Holder concentration (Gini)** | top 1/5/10 holders % from balances |
| **Ecosystem role detection** | if quote pair count > threshold → "quote currency" |
| **Velocity** | dispense volume / circulating supply over time period |
| **Is subasset?** | Check if asset_longname contains a dot |
| **Parent asset** | Parse longname before the dot |
| **Issuance timeline** | CP API issuances: creation → description changes → locks |
| **Transfer volume** | CP API sends: count + recent |
| **Price in USD** | BTC price × dispenser price, or XCP price × DEX price |

---

## INFORMATION HIERARCHY

### Tier 1 — Identity & First Impression (0.5 seconds)
- Full image, name, collection badge
- One-line summary: "995M supply · locked · 9 years old · Rare Pepe"
- Ecosystem role if notable: "Quote currency for 2,073 markets"

### Tier 2 — Key Numbers (2 seconds scan)
- Best price (cheapest way to buy)
- Market cap estimate
- Total BTC spent through dispensers
- Holder count
- Buy/sell pressure ratio
- Recent activity summary (7d trades + dispenses)

### Tier 3 — Where to Trade (actionable)
- Base pairs table (sell for BTC/XCP/etc) — price, change, volume
- Dispensers table — price, qty, remaining
- Swap listings if any
- Quote pairs (if significant) — "Use as currency to buy..."

### Tier 4 — Who Holds It
- Top 10 holders with %, burn tagged
- Concentration summary

### Tier 5 — Deep Context (expandable)
- Deal score / discount info
- Issuance history timeline
- Owner/issuer
- Description / JSON metadata
- External links (xcp.io, xchain.io)
