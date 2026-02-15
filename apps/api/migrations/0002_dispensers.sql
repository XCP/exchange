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

-- Rolling per-asset dispenser stats (like pair_stats)
CREATE TABLE dispenser_stats (
  asset                TEXT PRIMARY KEY,
  last_dispense_price  REAL,
  last_dispense_time   INTEGER,
  price_change_24h     REAL DEFAULT 0,
  price_change_7d      REAL DEFAULT 0,
  volume_24h           REAL DEFAULT 0,
  volume_7d            REAL DEFAULT 0,
  volume_30d           REAL DEFAULT 0,
  high_24h             REAL,
  low_24h              REAL,
  dispense_count_24h   INTEGER DEFAULT 0,
  dispense_count_7d    INTEGER DEFAULT 0,
  dispense_count_30d   INTEGER DEFAULT 0,
  active_dispensers     INTEGER DEFAULT 0,
  total_available       REAL DEFAULT 0,
  cheapest_price        REAL,
  first_dispense_time   INTEGER,
  updated_at            INTEGER
);
