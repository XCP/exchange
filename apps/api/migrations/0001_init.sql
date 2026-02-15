-- XCP DEX indexer schema (consolidated)

-- Raw order match data (source of truth)
CREATE TABLE trades (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    TEXT NOT NULL UNIQUE,
  pair        TEXT NOT NULL,
  base_asset  TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  block_index INTEGER NOT NULL,
  block_time  INTEGER NOT NULL,
  price       REAL NOT NULL,
  amount      REAL NOT NULL,
  volume      REAL NOT NULL,
  side        TEXT NOT NULL,
  maker       TEXT NOT NULL,
  taker       TEXT NOT NULL,
  tx0_hash    TEXT NOT NULL,
  tx1_hash    TEXT NOT NULL
);
CREATE INDEX idx_trades_pair_time ON trades(pair, block_time);
CREATE INDEX idx_trades_block ON trades(block_index);
CREATE INDEX idx_trades_base_asset ON trades(base_asset, block_time DESC);
CREATE INDEX idx_trades_quote_asset ON trades(quote_asset, block_time DESC);
CREATE INDEX idx_trades_pair_id ON trades(pair, id DESC);

-- Pre-aggregated OHLC candles
CREATE TABLE candles (
  pair        TEXT NOT NULL,
  interval    TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,
  open        REAL NOT NULL,
  high        REAL NOT NULL,
  low         REAL NOT NULL,
  close       REAL NOT NULL,
  volume      REAL NOT NULL,
  buy_volume  REAL NOT NULL DEFAULT 0,
  sell_volume REAL NOT NULL DEFAULT 0,
  trades      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pair, interval, timestamp)
);

-- Open/historical orders for book + lifecycle tracking
CREATE TABLE orders (
  tx_hash       TEXT PRIMARY KEY,
  tx_index      INTEGER NOT NULL,
  pair          TEXT NOT NULL,
  base_asset    TEXT NOT NULL,
  quote_asset   TEXT NOT NULL,
  source        TEXT NOT NULL,
  side          TEXT NOT NULL,
  price         REAL NOT NULL,
  amount        REAL NOT NULL,
  give_remaining REAL NOT NULL,
  get_remaining  REAL NOT NULL,
  expiration    INTEGER NOT NULL,
  expire_index  INTEGER NOT NULL,
  block_index   INTEGER NOT NULL,
  block_time    INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  first_seen_at INTEGER NOT NULL,
  closed_at     INTEGER
);
CREATE INDEX idx_orders_book ON orders(pair, status, side, price);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_source_status ON orders(source, status);
CREATE INDEX idx_orders_block ON orders(block_index);

-- Rolling stats + trending data
CREATE TABLE pair_stats (
  pair              TEXT PRIMARY KEY,
  base_asset        TEXT NOT NULL,
  quote_asset       TEXT NOT NULL,
  last_price        REAL,
  last_trade_time   INTEGER,
  last_side         TEXT,
  price_change_24h  REAL DEFAULT 0,
  price_change_7d   REAL DEFAULT 0,
  price_change_30d  REAL DEFAULT 0,
  volume_24h        REAL DEFAULT 0,
  volume_7d         REAL DEFAULT 0,
  volume_30d        REAL DEFAULT 0,
  high_24h          REAL,
  low_24h           REAL,
  high_7d           REAL,
  low_7d            REAL,
  high_30d          REAL,
  low_30d           REAL,
  trade_count_24h   INTEGER DEFAULT 0,
  trade_count_7d    INTEGER DEFAULT 0,
  trade_count_30d   INTEGER DEFAULT 0,
  first_trade_time  INTEGER,
  open_orders       INTEGER DEFAULT 0,
  bid_count         INTEGER DEFAULT 0,
  ask_count         INTEGER DEFAULT 0,
  best_bid          REAL,
  best_ask          REAL,
  spread            REAL,
  updated_at        INTEGER
);
CREATE INDEX idx_pair_stats_vol24 ON pair_stats(volume_24h DESC);
CREATE INDEX idx_pair_stats_trades24 ON pair_stats(trade_count_24h DESC);
CREATE INDEX idx_pair_stats_quote ON pair_stats(quote_asset);

-- Immutable dispense events (like trades)
CREATE TABLE dispenses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash          TEXT NOT NULL,
  dispense_index   INTEGER NOT NULL,
  asset            TEXT NOT NULL,
  block_index      INTEGER NOT NULL,
  block_time       INTEGER NOT NULL,
  source           TEXT NOT NULL,
  destination      TEXT NOT NULL,
  dispense_quantity REAL NOT NULL,
  btc_amount       REAL NOT NULL,
  price            REAL NOT NULL,
  dispenser_tx_hash TEXT NOT NULL,
  UNIQUE (tx_hash, dispense_index)
);
CREATE INDEX idx_dispenses_asset_time ON dispenses(asset, block_time);
CREATE INDEX idx_dispenses_block ON dispenses(block_index);

-- Current open dispenser state (like orders)
CREATE TABLE dispensers (
  tx_hash         TEXT PRIMARY KEY,
  tx_index        INTEGER NOT NULL,
  asset           TEXT NOT NULL,
  source          TEXT NOT NULL,
  give_quantity   REAL NOT NULL,
  escrow_quantity REAL NOT NULL,
  give_remaining  REAL NOT NULL,
  satoshi_price   INTEGER NOT NULL,
  price           REAL NOT NULL,
  dispense_count  INTEGER NOT NULL DEFAULT 0,
  status          INTEGER NOT NULL DEFAULT 0,
  block_index     INTEGER NOT NULL,
  block_time      INTEGER NOT NULL,
  oracle_address  TEXT,
  first_seen_at   INTEGER NOT NULL,
  closed_at       INTEGER
);
CREATE INDEX idx_dispensers_asset_status ON dispensers(asset, status);
CREATE INDEX idx_dispensers_source ON dispensers(source);
CREATE INDEX idx_dispensers_block ON dispensers(block_index);

-- Rolling per-asset dispenser stats
CREATE TABLE dispenser_stats (
  asset                TEXT PRIMARY KEY,
  last_dispense_price  REAL,
  last_dispense_time   INTEGER,
  price_change_24h     REAL DEFAULT 0,
  price_change_7d      REAL DEFAULT 0,
  price_change_30d     REAL DEFAULT 0,
  volume_24h           REAL DEFAULT 0,
  volume_7d            REAL DEFAULT 0,
  volume_30d           REAL DEFAULT 0,
  high_24h             REAL,
  low_24h              REAL,
  high_7d              REAL,
  low_7d               REAL,
  high_30d             REAL,
  low_30d              REAL,
  dispense_count_24h   INTEGER DEFAULT 0,
  dispense_count_7d    INTEGER DEFAULT 0,
  dispense_count_30d   INTEGER DEFAULT 0,
  active_dispensers    INTEGER DEFAULT 0,
  total_available      REAL DEFAULT 0,
  cheapest_price       REAL,
  first_dispense_time  INTEGER,
  updated_at           INTEGER
);

-- Crash-only sync state
CREATE TABLE indexer_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed initial mode
INSERT INTO indexer_state (key, value) VALUES ('indexer_mode', 'IDLE');
