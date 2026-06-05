# Asset Page — Rankings & Audience Mapping

## Three Audiences

### 1. Asset Owner (creator/issuer)
**Goal**: Share this page. Prove their asset has value, activity, community.
**What they want to see**: Numbers that make their asset look good. Rankings. Holder count. Volume. Things they can screenshot and post on Twitter.
**What makes them share**: "#3 by BTC volume out of 11,000 assets" — that's a tweet.

### 2. Asset Holder
**Goal**: Monitor their bag. Understand liquidity. Find best exit/entry.
**What they want to see**: Current prices, where to sell, holder concentration, activity trends.
**What makes them come back**: Fresh data, prices updating, new dispenses showing up.

### 3. Potential Buyer
**Goal**: Due diligence. Is this real? Is it liquid? Should I buy?
**What they want to see**: Social proof (holders, traders, BTC volume), best price to buy, supply info, who holds it.
**What makes them convert**: Clear buy path (cheapest dispenser), confidence signals (locked supply, many holders, BTC spent).

---

## Rankable Metrics

From existing data, all queryable from our DB:

### Dispenser Rankings (universe: 11,036 assets with dispenser activity)

| Metric | What it signals | PEPECASH rank | Best audience |
|--------|----------------|---------------|---------------|
| Total BTC spent | Real economic value has flowed through this asset | #3 | Owner, Buyer |
| Total dispense count | Transaction frequency, demand | #2 | Owner |
| Unique buyers | Community breadth | #2 | Owner, Buyer |
| Unique sellers | Market maker breadth | queryable | Holder |
| Active dispensers | Current availability | queryable | Buyer |
| 7d/30d volume | Recent momentum | queryable | Holder, Buyer |

### DEX Trading Rankings (universe: 10,281 pairs)

| Metric | What it signals | PEPECASH rank | Best audience |
|--------|----------------|---------------|---------------|
| Total trade count (best pair) | Most actively traded | #1 | Owner |
| Unique traders (best pair) | Most broadly traded | #1 | Owner, Buyer |
| Total volume (best pair) | Value transacted | queryable | Owner |
| Open orders | Current liquidity | queryable | Buyer, Holder |

### Holder Rankings (would need new query across assets)

| Metric | What it signals | Best audience |
|--------|----------------|---------------|
| Holder count | Community size | Owner, Buyer |
| Unique addresses ever transacted | Historical reach | Owner |

### Collection Rankings (within a collection like Rare Pepe)

| Metric | What it signals | Best audience |
|--------|----------------|---------------|
| #N in collection by BTC volume | Standing among peers | Owner |
| #N in collection by trades | Popularity within community | Owner, Holder |
| #N in collection by holders | Distribution | Owner, Buyer |

Collection rankings are especially powerful because they're relative to peers — "Ranked #3 in Rare Pepe" is more meaningful than "#3 of 11,000 random assets."

---

## Which Rankings to Show (and When)

### Rule: Only show rankings that make the asset look notable.

A ranking of #8,432 out of 11,000 is not share-worthy. Show rankings when:
- **Top 1%** (top ~100 of 11,000) → "Top 1% by BTC volume"
- **Top 10 in collection** → "#3 in Rare Pepe by trade volume"
- **#1 in anything** → Always show, even niche metrics

### Rule: Frame positively.

- Don't show: "#847 by holder count"
- Do show: "More holders than 92% of assets" (only if >50th percentile)
- Or just don't show it at all if not notable

### Rule: Collection rank > Global rank (when available)

"#3 in Rare Pepe" hits harder than "#3 of 11,036 assets" because:
- The peer group is understood (Rare Pepe = prestigious collection)
- The ranking is more competitive (smaller pool)
- The collection has brand recognition

Show both if both are impressive. Show only collection if global isn't notable.

---

## How Rankings Serve Each Audience

### For the Owner (shareable signals)
```
"#1 most traded pair on the DEX (9,400 trades)"
"#2 most dispensed asset (5,272 dispenses)"
"#3 by total BTC volume (74.51 BTC)"
"#3 in Rare Pepe collection by volume"
"1,634 unique buyers · 7,816 holders"
```
These are tweetable. Screenshot-worthy. The owner sees this and thinks "I want to share this page."

### For the Holder (monitoring signals)
```
"Best price: 0.0000035 BTC (dispenser) · 0.0024 XCP (DEX)"
"Buy pressure 50x > sell pressure (124 open orders)"
"54 active dispensers · 7d: 3 dispenses"
"Top 10 holders own 63% of supply"
```
Actionable. Where to sell, what's the demand, how concentrated.

### For the Buyer (confidence signals)
```
"74.51 BTC spent buying this asset"
"1,634 unique buyers have purchased through dispensers"
"Locked supply · 9 years old · 7,816 holders"
"Cheapest dispenser: 0.0000001 BTC"
```
Social proof + clear buy path. "Other people bought this, it's been around forever, and here's how to buy it."

---

## Visual Treatment of Rankings

### Option A: Badge/ribbon approach
Small pill badges near the asset name:
```
PEPECASH
#1 Most Traded · #2 Most Dispensed · #3 BTC Volume
```
Subtle, informational, scannable.

### Option B: Dedicated rankings section
A small card/section in Tier 2:
```
┌─ Rankings ──────────────────┐
│ #1  Most traded pair (DEX)  │
│ #2  Most dispensed asset    │
│ #3  BTC volume (dispensers) │
│ #3  in Rare Pepe collection │
└─────────────────────────────┘
```
More prominent, feels like an achievement showcase.

### Option C: Inline with stats
Weave rankings into the stat cards:
```
[BTC Spent: 74.51 BTC  #3 of 11,036]
[Dispenses: 5,272      #2 of 11,036]
[Traders: 1,771        #1 of 10,281]
```
Contextualizes the number — "5,272 dispenses" means more when you know it's #2.

### Recommendation: Option C (inline) + Option A (top badges for top-10)

- If the asset ranks top 10 globally or top 3 in its collection on ANY metric, show badges under the name in Tier 1
- In Tier 2 stat cards, show the rank as a secondary line under each value where ranking is top ~100
- This way: casual visitors see the badges, detail-oriented visitors see the inline ranks

---

## Implementation Notes

### New API endpoint needed: `/asset/{asset}/rankings`

Returns pre-computed or on-demand rankings:
```json
{
  "asset": "PEPECASH",
  "global": {
    "btc_spent_rank": 3,
    "btc_spent_total": 11036,
    "dispense_count_rank": 2,
    "dispense_count_total": 11036,
    "unique_buyers_rank": 2,
    "unique_buyers_total": 11036,
    "dex_trades_rank": 1,        // best pair
    "dex_trades_pair": "PEPECASH_XCP",
    "dex_trades_total": 10281,
    "dex_traders_rank": 1,
    "dex_traders_total": 10281,
    "holder_count": 7816,        // from CP API, not ranked yet
  },
  "collection": {
    "slug": "rare-pepe",
    "name": "Rare Pepe",
    "btc_spent_rank": 3,
    "btc_spent_total": 524,      // assets in collection
    "dispense_count_rank": 2,
    "trade_count_rank": 1,
    // etc.
  }
}
```

This could be computed on-demand (a few COUNT queries with WHERE clauses) or pre-computed during REFRESH_STATS. On-demand is fine for now since it's just:
```sql
SELECT COUNT(*) + 1 FROM dispenser_stats
WHERE total_btc_spent > (SELECT total_btc_spent FROM dispenser_stats WHERE asset = ?)
```

### What about low-ranking assets?

For an asset that ranks #5,000 — just don't show rankings. The rankings section is conditionally rendered only when there's something worth showing. The page still works fine without it — the tiers still flow. Rankings are a bonus for notable assets, not a requirement.
