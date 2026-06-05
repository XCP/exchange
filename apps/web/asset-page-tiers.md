# Asset Page — Final Build Spec

## Layout: Option C (image+name hero top, full-width data below)

```
┌─────────────────────────────────────────────────┐
│ [Image 220px]  │  Name, collection, vitals      │  TIER 1
│                │  Rankings badges (if top 10)    │
│                │  Stats cards (3 cols)           │  TIER 2
├─────────────────────────────────────────────────┤
│ [Dispensers table]    │  [DEX Markets table]     │  TIER 3
│                       │                          │
├─────────────────────────────────────────────────┤
│ [Top Holders table]   │  [Details collapsed]     │  TIER 4
│                       │  [External links]        │
└─────────────────────────────────────────────────┘
```

Mobile: single column, image full-width with name overlaid, then stacked.

## New API Endpoint

`GET /asset/{asset}/rankings`

Computes rank + percentile for key metrics. Returns:
```json
{
  "asset": "PEPECASH",
  "rankings": [
    { "metric": "dex_trades", "label": "DEX Trades", "value": 9400, "rank": 1, "total": 10281, "percentile": 99.99, "scope": "global", "pair": "PEPECASH_XCP" },
    { "metric": "dex_traders", "label": "Unique Traders", "value": 1771, "rank": 1, "total": 10281, "percentile": 99.99, "scope": "global", "pair": "PEPECASH_XCP" },
    { "metric": "btc_spent", "label": "BTC Spent", "value": 74.51, "rank": 3, "total": 11036, "percentile": 99.97, "scope": "global" },
    { "metric": "dispense_count", "label": "Dispenses", "value": 5272, "rank": 2, "total": 11036, "percentile": 99.98, "scope": "global" },
    { "metric": "unique_buyers", "label": "Unique Buyers", "value": 1634, "rank": 2, "total": 11036, "percentile": 99.98, "scope": "global" }
  ],
  "collection": { "slug": "rare-pepe", "name": "Rare Pepe", "total_assets": 524 }
}
```

Queries (each is a simple COUNT):
```sql
SELECT COUNT(*) + 1 FROM dispenser_stats WHERE total_btc_spent > (SELECT total_btc_spent FROM dispenser_stats WHERE asset = ?)
SELECT COUNT(*) FROM dispenser_stats WHERE total_btc_spent IS NOT NULL  -- for total
-- repeat for dispense_count, unique_buyers
-- for DEX: use pair_stats with best pair by total_trade_count
```

## Ranking Display Rules

| Percentile | Framing | Example |
|-----------|---------|---------|
| Top 10 (rank) | `#N` badge near name | `#3 by BTC volume` |
| Top 1% | Specific rank, inline on stat card | `#47 of 11,036` |
| Top 10% | Percentile | `Top 5%` |
| Top 50% | Percentile | `Top 38%` |
| Bottom 50% | Just the value, no rank | `74.51 BTC` |

Rankings section is always present — framing degrades, space never disappears.

## Tier Details

### Tier 1 — Identity
- Image (220px wide, 5:7 ratio, `border border-zinc-800 rounded-sm`)
- Name (`text-xl font-semibold`)
- Collection badge (italic text link)
- Vitals: supply · locked · age · holders (single line, `text-xs text-zinc-400/500`)
- Top-10 ranking badges below vitals (small pills, only if top 10 globally or top 3 in collection)
- Description text (if short and not JSON URL)

### Tier 2 — Key Numbers
- 3-column stat cards (`grid-cols-2 md:grid-cols-3`)
- Pick best 3-6 from: best price, BTC spent, unique buyers, 7d activity, pressure ratio, ecosystem role
- Each card: label + value + optional rank annotation below value
- Rank annotation: `text-[10px] text-zinc-500` — "#3 of 11,036" or "Top 5%" or nothing

### Tier 3 — Where to Trade
- Two-column: Dispensers | DEX Markets
- Dispensers: cheapest 5-8, price/qty/remaining columns
- DEX Markets: base pairs sorted by volume, pair/price/24h columns
- Quote pairs: if >50 quote pairs, add "Currency for N markets" note
- Swap listings: row at bottom of dispensers section
- Links to deep-dive pages

### Tier 4 — Who Holds It + Context
- Top Holders: 8 rows, address/% supply, burn tagged
- Concentration line above table: "Top 10 hold X%"
- Details (collapsed): owner, issuer, divisibility, lock, block, issuance history
- External links: xcp.io, xchain.io

## Files to Create/Modify
1. `apps/api/src/routes/asset-rankings.ts` — NEW endpoint
2. `apps/api/src/index.ts` — register route
3. `apps/web/src/app/[asset]/page.client.tsx` — full rewrite
4. Apply frontend skill constraints throughout
