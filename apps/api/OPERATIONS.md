# XCP DEX API — Operations Guide

## Overview

The API is a Cloudflare Worker + D1 (SQLite) that indexes Counterparty DEX activity from the Bitcoin blockchain. It pulls data from the Counterparty API (`api.counterparty.io:4000/v2`), stores it in D1, and serves aggregated trading data (OHLC candles, order books, trade history, etc.).

**Worker URL:** `https://xcpdex-api.me-bbe.workers.dev`
**Cron schedule:** Every 10 minutes (`*/10 * * * *`)

---

## State Machine

The indexer progresses through a linear sequence of modes. Each mode does one job, then transitions to the next.

```
IDLE → BACKFILL_TRADES → BACKFILL_DISPENSES → SNAPSHOT_SYNC → BUILD_AGGREGATES → FOLLOWING
                                                                                    ↻ cron
```

| Mode | Driver | What it does |
|------|--------|-------------|
| `IDLE` | Nothing | Fresh DB, waiting for you to start |
| `BACKFILL_TRADES` | You (POST loop) | Imports all historical order matches (cursor pagination) |
| `BACKFILL_DISPENSES` | You (POST loop) | Imports all historical dispenses (cursor pagination) |
| `SNAPSHOT_SYNC` | You (POST loop) | Snapshots all open orders + dispensers, records chain tip |
| `BUILD_AGGREGATES` | You (POST loop) | Builds OHLC candles + pair stats for every trading pair |
| `FOLLOWING` | Cron (automatic) | Processes new blocks every 10 min, keeps everything up to date |

**Key point:** Modes `IDLE` through `BUILD_AGGREGATES` are manually driven — you call the API in a loop until it finishes. Once it reaches `FOLLOWING`, the cron takes over and you never need to touch it again.

---

## Full Index: Start to Finish

### Prerequisites

1. Apply the latest migration:
   ```bash
   cd apps/api
   npx wrangler d1 migrations apply xcpdex --remote
   ```

2. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

3. Set your indexer token (one-time):
   ```bash
   npx wrangler secret put INDEXER_TOKEN
   ```

### Step 1: Start the indexer

```bash
curl -X POST https://xcpdex-api.me-bbe.workers.dev/indexer/start \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected response:**
```json
{"ok": true, "mode": "BACKFILL_TRADES"}
```

This transitions `IDLE → BACKFILL_TRADES` and clears any stale state from previous runs.

### Step 2: Run the backfill loop

Call `/indexer/backfill` repeatedly. It auto-detects the current mode and does the right thing:

```bash
while true; do
  curl -s -X POST "https://xcpdex-api.me-bbe.workers.dev/indexer/backfill?pages=50" \
    -H "Authorization: Bearer YOUR_TOKEN"
  sleep 2
done
```

The `pages` parameter controls how many API pages per call (max 50, default 20). Higher = faster but uses more Worker CPU time.

**What you'll see — Phase by phase:**

#### BACKFILL_TRADES
```json
{"type": "trades", "inserted": 842, "pages": 50, "done": false, "total": 193600, "progress": "45.2"}
```
- `progress` is a percentage. When it hits `100.0` and `done: true`, mode auto-transitions to `BACKFILL_DISPENSES`.
- Total trades: ~193K. At 50 pages × 200 per page = 10K per call. ~20 calls to complete.

#### BACKFILL_DISPENSES
```json
{"type": "dispenses", "inserted": 1200, "pages": 50, "done": false, "total": 204469, "progress": "33.1"}
```
- Same pattern. ~204K dispenses. ~20 calls to complete.
- When done, auto-transitions to `SNAPSHOT_SYNC`.

#### SNAPSHOT_SYNC
```json
{"type": "snapshot", "step": "orders", "synced": 2481, "closed": 0}
```
The snapshot runs in sub-steps: `orders` → `dispensers_0` → `dispensers_1` → `finalize`. Keep calling until you see:
```json
{"type": "snapshot", "step": "finalize", "dispensers": 25895, "mode": "BUILD_AGGREGATES"}
```
- This snapshots all open orders (~2.5K) and dispensers (~26K) from the live Counterparty API.
- Records the current Bitcoin block height as our sync checkpoint.
- When finalized, auto-transitions to `BUILD_AGGREGATES`.

#### BUILD_AGGREGATES
```json
{"type": "aggregates", "done": false, "processed": 50, "cursor": "SOME_PAIR_NAME"}
```
- Processes 50 trading pairs per call, building OHLC candles for all 6 intervals (1h, 4h, 1d, 1w, 1m, 1y).
- ~11.8K pairs total. ~236 calls to complete.
- When done: `{"type": "aggregates", "done": true, "processed": 0}` and mode transitions to `FOLLOWING`.

#### FOLLOWING
```json
{"done": true, "mode": "FOLLOWING"}
```
Backfill is complete. The cron now handles everything.

### Step 3: Verify

```bash
curl -s https://xcpdex-api.me-bbe.workers.dev/status | python -m json.tool
```

**Expected response when fully indexed:**
```json
{
  "ok": true,
  "mode": "FOLLOWING",
  "trades": 193600,
  "pairs": 11806,
  "open_orders": 2481,
  "dispenses": 204469,
  "open_dispensers": 25895,
  "candles": 700000,
  "indexer": {
    "indexer_mode": "FOLLOWING",
    "last_block_index": "936800",
    "last_block_hash": "00000000000000000...",
    "last_run_time": "1739..."
  }
}
```

**What to check:**
- `mode` is `FOLLOWING`
- `trades` is ~193K+
- `dispenses` is ~204K+
- `candles` is high (each pair × 6 intervals × buckets)
- `last_block_index` is near Bitcoin's current block height (~936K as of Feb 2026)

---

## FOLLOWING Mode (Steady State)

Once in `FOLLOWING`, the cron runs every 10 minutes and:

1. Acquires an advisory lock (prevents concurrent runs)
2. Fetches the current Bitcoin block height from the Counterparty API
3. Checks for reorgs (both tip-behind and same-height hash mismatch)
4. Processes new blocks since our checkpoint (up to 5 per cron run)
5. For each block: inserts trades, upserts/closes orders, upserts/updates dispensers, inserts dispenses
6. Updates OHLC candles and pair stats for affected pairs
7. Updates dispenser stats for affected assets
8. Updates order book stats if any orders changed
9. Saves the new checkpoint and block hash
10. Releases the advisory lock

**You don't need to do anything.** Data updates every ~10 minutes, matching Bitcoin's block time.

### Rolling-Window Sweeps

Pairs and assets with fresh activity are repriced inside block sync. Windows also
drift as trades age out of them with no block involved, so gated sweeps repair the
rest. Each gate stores its last run in `indexer_state`:

| Key | Interval | Covers |
|-----|----------|--------|
| `pair_stats_swept_at` | 1h | 24h and 30d windows for pairs traded in the last 30 days |
| `dispenser_stats_swept_at` | 1h | Same, for dispenser assets |
| `pair_stats_1y_swept_at` | 24h | The 1y window for pairs traded in the last year |
| `dispenser_stats_1y_swept_at` | 24h | Same, for dispenser assets |

The year sweeps run daily on purpose: they touch an order of magnitude more rows
than the 30-day ones, and a trade only leaves a 365-day window once it is 365 days
old, so hourly rewrites would burn D1 writes changing nothing. To force an immediate
full recompute of every window, set the indexer to `REFRESH_STATS` — it runs the
catch-up stats pass and returns to `FOLLOWING` on its own.

### Reorg Handling

The indexer detects two types of Bitcoin chain reorganizations:

- **Tip rollback:** Chain tip is behind our checkpoint (the node switched to a shorter chain and is catching up). Rolls back to the new tip.
- **Same-height reorg:** Chain tip is at or ahead of our checkpoint, but the block hash at our checkpoint has changed (the block was replaced by a different one at the same height). Rolls back to one block before the mismatch.

In both cases, the indexer:
- Deletes trades, dispenses, orders, and dispensers from invalidated blocks
- Re-opens orders/dispensers that were closed by events in those blocks
- Deletes and rebuilds affected candles
- Recalculates pair stats, dispenser stats, and order book stats

Bitcoin reorgs are rare (1-2 blocks) and this handles them automatically.

---

## Endpoints Reference

### Public (no auth)

| Endpoint | Description |
|----------|-------------|
| `GET /status` | Mode, progress, table counts, indexer state |
| `GET /ohlc/:pair?interval=1d&limit=300` | OHLC candles. Intervals: `1h`, `4h`, `1d`, `1w`, `1m`, `1y` |
| `GET /trades/:pair?limit=50` | Recent trades for a pair |
| `GET /book/:pair` | Order book (bids + asks + dispensers) |
| `GET /pair/:pair` | Pair summary stats |
| `GET /pairs?quote=XCP&sort=volume_24h` | List pairs |
| `GET /markets` | Market overview |
| `GET /trending` | Trending pairs |
| `GET /asset/:name` | Asset-level stats |
| `GET /dispenser-stats/:asset` | Dispenser stats for an asset |
| `GET /portfolio/:address/bids` | Open bids for an address |
| `GET /portfolio/:address/orders` | Open orders for an address |
| `GET /portfolio/:address/dispensers` | Active dispensers for an address |

### Aggregator integration (no auth)

Endpoints shaped to CoinGecko's "Integration Ideal API Endpoints" spec and CoinMarketCap's Ideal API summary. One dataset, two presentations: completed order-book trades (incl. pool fills), plus dispenser fills for BTC-quoted pairs.

Accounting rules:

- **Dispenser volume is protocol-priced notional** (`dispense_quantity × dispenser rate`, joined via `dispenser_tx_hash`), never the gross BTC recorded on the dispense row. One BTC payment can trigger dispensers for several assets at one address and Counterparty stamps the FULL payment on every resulting row (audited in prod: 7,303 payments produced 35,232 multi-asset rows), so summing `btc_amount` double-counts and the stored per-row price is inflated. Overpayment beyond the rate is likewise excluded.
- Quantities/volumes are fixed 8-decimal strings. **Unit prices are full-precision decimal strings** (`decPrice`) — 8dp would zero out sub-satoshi unit prices (1 sat per 1,000 units = 1e-11).
- Timestamps are UTC milliseconds. Tickers carry `last_trade_timestamp` + `is_stale` (no completed fill in 90 days) so decade-old last prices are labeled, not hidden.
- `trade_id` = `source_id × 8 + code` (0 = order-book, 1 = AMM pool, 2 = dispenser, 3 reserved for PSBT swaps). Rows only ever append under protocol-derived UNIQUE keys, so IDs are permanent unless a table is dropped. Each historical trade also carries `source` and `settlement_txid` for independent audit.

The feed is an **explicit allowlist** — edit `INTEGRATION_PAIRS` in `src/lib/market-summary.ts` to add/remove markets (currently XCP_BTC + top-10 all-time currency assets × both quotes). Every query is a per-pair indexed lookup, so a request costs tens of D1 rows read regardless of table sizes; unknown tickers return 404. Pairs with no price history self-prune from tickers.

| Endpoint | Description |
|----------|-------------|
| `GET /coingecko/pairs` | Active markets as `{ticker_id, base, target}` |
| `GET /coingecko/tickers` | 24h rolling price/volume/bid/ask per pair |
| `GET /coingecko/orderbook?ticker_id=XCP_BTC&depth=100` | Price-level aggregated book; open dispensers merged into asks on BTC pairs |
| `GET /coingecko/historical_trades?ticker_id=XCP_BTC&type=buy&limit=200` | Completed fills split into `buy`/`sell`; dispenses are always buys |
| `GET /coinmarketcap/summary` | CMC summary: all pairs with `last_price`, 24h volumes, `type: "spot"` |
| `GET /catalog/pairs` | Market catalog: per-asset protocol/divisibility/longname/explorer URL, data-driven `execution_sources`, `status` (active/stale/inactive) |

Aggregator-facing base URL: **`https://api.xcpdex.com`** (custom domain on this worker; workers.dev remains for existing consumers). Historical trades drop-and-log `PRICE_QUANTIZATION_LOSS` if a nonzero execution ever carries a zero stored price.

**`npm run reconcile`** verifies the live integration surface end to end: CMC == CG field-for-field, ticker bid/ask == orderbook tops, ticker volumes/high/low/last == the full paged rolling-24h historical window, no duplicate trade IDs, no nonpositive prices, sorted books, stale flags consistent with the 90-day rule. Pairs whose ticker changes mid-run are reported UNSTABLE and skipped (rerun). Run before any aggregator submission and after any accounting change.

### Internal (requires `Authorization: Bearer TOKEN`)

| Endpoint | Description |
|----------|-------------|
| `POST /indexer/start` | `IDLE → BACKFILL_TRADES` |
| `POST /indexer/backfill?pages=20` | Auto-detects phase, processes one batch |
| `POST /indexer/sync?blocks=10` | Manual block sync (any mode) |
| `POST /indexer/aggregate?offset=0&limit=100` | Manual aggregate for specific pair range |
| `POST /indexer/full-sync` | Re-snapshot orders + dispensers (recovery) |
| `POST /indexer/reset` | Reset to `IDLE` (for full re-index) |

---

## Recovery Procedures

### The cron isn't processing blocks

Check `/status`. If `mode` is not `FOLLOWING`, the indexer is stuck in a previous phase. Options:

1. **Resume where it left off:** Call `/indexer/backfill` in a loop until it reaches `FOLLOWING`.
2. **Full re-index:** `POST /indexer/reset` then `POST /indexer/start` and run the backfill loop.

### Orders/dispensers are stale

Run a full re-snapshot (works in any mode):
```bash
curl -X POST https://xcpdex-api.me-bbe.workers.dev/indexer/full-sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

This re-fetches all open orders and dispensers from the Counterparty API and reconciles with the DB.

### Candles are missing or wrong

Trigger manual reaggregation:
```bash
# Reaggregate all pairs, 100 at a time
for offset in $(seq 0 100 12000); do
  curl -s -X POST "https://xcpdex-api.me-bbe.workers.dev/indexer/aggregate?offset=$offset&limit=100" \
    -H "Authorization: Bearer YOUR_TOKEN"
  sleep 1
done
```

### Full re-index from scratch

```bash
# 1. Reset
curl -X POST .../indexer/reset -H "Authorization: Bearer $TOKEN"

# 2. Apply fresh migration (drops all tables)
npx wrangler d1 migrations apply xcpdex --remote

# 3. Deploy + start
npx wrangler deploy
curl -X POST .../indexer/start -H "Authorization: Bearer $TOKEN"

# 4. Run backfill loop
while true; do
  curl -s -X POST ".../indexer/backfill?pages=50" -H "Authorization: Bearer $TOKEN"
  sleep 2
done
```

---

## Architecture Notes

### Data Flow

```
Counterparty API (api.counterparty.io:4000/v2)
  ↓ fetch
Cloudflare Worker (normalize + insert)
  ↓ write
D1 Database (SQLite)
  ↓ read
Public API endpoints
  ↓ fetch
xcpdex.com frontend
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `trades` | Historical order matches (base of all analytics) |
| `dispenses` | Historical dispenses (vending machine sales) |
| `orders` | Open + recently closed DEX orders |
| `dispensers` | Open + recently closed dispensers |
| `candles` | Pre-computed OHLC candles (6 intervals per pair) |
| `pair_stats` | Rolling stats per trading pair (24h volume, price change, etc.) |
| `dispenser_stats` | Per-asset dispenser aggregates |
| `indexer_state` | Key-value store for indexer state machine |

### Pair Naming Convention

Pairs are `BASE_QUOTE` where the quote asset is the "money" side. Base assets are alphabetically/numerically sorted when neither side is a known quote (BTC, XCP). Examples: `PEPECASH_XCP`, `UNCOMMONGOODS_BTC`, `A1234_A5678`.

### Counterparty API Rate Limits

The Counterparty API has no formal rate limit but is a community resource. The cron runs every 10 minutes (matching Bitcoin's block time) which is respectful. During backfill, the 2-second sleep between calls prevents hammering.
