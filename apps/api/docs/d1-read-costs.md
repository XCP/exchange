# D1 read costs — measured, and what is left

Measured 2026-08-23 with `wrangler d1 insights xcpdex --time-period 1d --sort-by reads --limit 60`.
`xcpdex` is 1.23 GB and served **309,489,761 rows read** and 77,083 rows written in 24 hours.

Writes are healthy and need no work: the two largest are batched `json_each` updates to
`pair_stats` and `dispenser_stats` at ~925 and ~435 rows per statement. Reads are where the money
is. This file records what was fixed, and — more usefully — what was deliberately *not*.

## Fixed: the default markets browse (migration 0048)

| Statement | Rows read/day | Runs | Per run |
|---|---|---|---|
| `SELECT COUNT(*) … trade_count_24h > 0 AND hidden = 0` | 21,248,176 | 1,732 | 12,268 |
| the matching page, `ORDER BY volume_24h DESC` | 21,098,886 | 1,718 | 12,281 |

42.3M rows a day — 13.7% of the whole database — to return **nine** rows. Fixed with a partial
index plus `INDEXED BY`; verified at 9 rows read per call. See migration `0048` and the comment in
`routes/markets.ts` for why the hint is required and why it must stay paired with the index.

## Not fixed: the dispenser-stats site summary

**This is the largest single read in the database and it is still there. Deliberately.**

```
61,070,022 rows read | 42 runs | 1,454,048 rows per run | 1,882 ms
```

`routes/dispenser-stats.ts` computes four site-wide aggregates on every cache miss: open dispenser
count, total dispenses, total BTC volume, and distinct buyers — each a full aggregate over
`dispensers` (101,962 rows) and `dispenses` (207,605 rows), the latter scanned three times.

### What was tried and rejected

**Rewriting the correlated `NOT EXISTS` as an anti-join.** Only 15 assets are hidden, so probing
`dispenser_stats` once per row looked like the waste. Measured on production, identical results:

| form | rows read |
|---|---|
| current `NOT EXISTS` | 1,454,166 |
| `NOT IN (SELECT asset FROM dispenser_stats WHERE hidden = 1)` | 1,536,477 |

The rewrite is **worse**. The correlated subquery was never the cost — the triple scan of
`dispenses` is.

**Deriving the totals from `dispenser_stats` (18,223 rows).** It already carries per-asset
`total_dispense_count`, `total_btc_spent`, `active_dispensers`, `unique_buyers`. Summed over
`hidden = 0`, at 18,209 rows read:

| aggregate | from `dispenser_stats` | true value | usable |
|---|---|---|---|
| open dispensers | 26,046 | 26,046 | ✅ exact |
| total dispenses | 135,821 | 163,238 | ❌ short by 27,417 |
| total BTC volume | 1,591.91 | 1,892.02 | ❌ short by 300.11 |
| unique buyers | 97,709 | 14,160 | ❌ sums per-asset, double-counts |

Only one of four survives. `dispenser_stats` does not cover every asset that has dispenses, so
deriving the rest would **silently change published numbers** — a correctness regression traded for
a read saving. Not worth it. (`unique_buyers` was never going to work: a distinct count across
assets cannot be a sum of per-asset distinct counts.)

**Naive materialization.** The obvious fix — a summary table refreshed by the indexer — is a
regression as specified. The indexer touches `dispenser_stats` **109 times a day**; this query runs
**42**. Refreshing on the indexer's cadence turns 61M rows/day into 158M. Hourly refresh gives
35M/day, a 1.7× win that is not worth a new table and a staleness window.

### What would actually work

Materialization **gated on change**, not on cadence: keep a watermark of the highest `dispenses`
block seen at last refresh and skip the recompute when it has not moved. Cost then scales with
dispense arrival rather than with cron ticks. Worth doing only after measuring how many distinct
blocks actually bring dispenses per day — if that number is above ~40 the gate buys nothing, and
the honest answer is to leave this query alone.

The alternative, if `unique_buyers` is the only blocker, is a distinct-buyer projection
(`dispense_buyers(destination)` maintained on insert) so the count becomes `COUNT(*)` over a small
table, and the other three aggregates become incrementally maintainable. That is a real design
change, not a tuning pass.

### Why it was left

61M rows/day is roughly 20% of this database's reads and, at D1 read pricing, small in absolute
terms. Every cheap fix measured either changed the numbers or cost more. Shipping a speculative
one would have traded correctness or spend for the appearance of progress.

## Other reads worth knowing about

| Rows read/day | Runs | Per run | Query |
|---|---|---|---|
| 31,463,466 | 124 | 253,737 | asset listing (`asset, asset_longname, supply_normalized, …`) |
| 23,314,751 | 29 | 803,956 | `SUM(CASE WHEN quote_asset = 'XCP' …)` volume rollup |
| 17,968,564 | 32 | 561,517 | `SUM(total_btc_spent)` rollup |
| 14,821,208 | 20 | 741,060 | daily dispense-volume bucketing |

All four are low-frequency, high-cost aggregates in the same family as the dispenser summary. If
the change-gated materialization above proves out, it is the pattern for these too — measure each
before building anything.

## Reproducing

```bash
wrangler d1 insights xcpdex --time-period 1d --sort-by reads --limit 60 --json
wrangler d1 insights xcpdex --time-period 1d --sort-by writes --limit 60 --json
```

The flags are `--time-period` (not `--timePeriod`, which is silently ignored) and `--limit`, which
defaults to **5** — both easy to get wrong and both quietly produce a misleading picture.

To confirm a plan actually changed, `EXPLAIN QUERY PLAN` is not enough on its own: read `rows_read`
from `--json` meta on the real statement. A plan can look right and still scan.
