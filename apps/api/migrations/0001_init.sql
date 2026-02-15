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
CREATE INDEX idx_orders_pair_status ON orders(pair, status);
CREATE INDEX idx_orders_pair_side_price ON orders(pair, side, price);
CREATE INDEX idx_orders_source ON orders(source);
CREATE INDEX idx_orders_status ON orders(status);

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
  volume_24h        REAL DEFAULT 0,
  volume_7d         REAL DEFAULT 0,
  volume_30d        REAL DEFAULT 0,
  high_24h          REAL,
  low_24h           REAL,
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

-- Crash-only sync state
CREATE TABLE indexer_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
