-- Address-level AMM pool accounting.

CREATE TABLE IF NOT EXISTS pool_lp_balance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  tx_index INTEGER,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  address TEXT NOT NULL,
  holder TEXT NOT NULL,
  holder_type TEXT NOT NULL DEFAULT 'address',
  owner_address TEXT,
  counterparty TEXT,
  delta_raw INTEGER NOT NULL,
  delta REAL NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE(event, tx_hash, event_index, holder, delta_raw)
);

CREATE INDEX IF NOT EXISTS idx_pool_lp_events_lp_block ON pool_lp_balance_events(lp_asset, block_index, event_index);
CREATE INDEX IF NOT EXISTS idx_pool_lp_events_address ON pool_lp_balance_events(address, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_lp_events_owner ON pool_lp_balance_events(owner_address, block_time DESC);

CREATE TABLE IF NOT EXISTS pool_lp_balances (
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  address TEXT NOT NULL,
  holder TEXT NOT NULL,
  holder_type TEXT NOT NULL DEFAULT 'address',
  owner_address TEXT,
  balance_raw INTEGER NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  updated_block_index INTEGER,
  updated_block_time INTEGER,
  PRIMARY KEY (lp_asset, holder)
);

CREATE INDEX IF NOT EXISTS idx_pool_lp_balances_address ON pool_lp_balances(address);
CREATE INDEX IF NOT EXISTS idx_pool_lp_balances_owner ON pool_lp_balances(owner_address);
CREATE INDEX IF NOT EXISTS idx_pool_lp_balances_lp_balance ON pool_lp_balances(lp_asset, balance_raw DESC);

CREATE TABLE IF NOT EXISTS pool_lp_balance_snapshots (
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  address TEXT NOT NULL,
  holder TEXT NOT NULL,
  holder_type TEXT NOT NULL DEFAULT 'address',
  owner_address TEXT,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  balance_raw INTEGER NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (lp_asset, holder, block_index)
);

CREATE INDEX IF NOT EXISTS idx_pool_lp_snapshots_block ON pool_lp_balance_snapshots(block_index);
CREATE INDEX IF NOT EXISTS idx_pool_lp_snapshots_address ON pool_lp_balance_snapshots(address, block_index DESC);
CREATE INDEX IF NOT EXISTS idx_pool_lp_snapshots_owner ON pool_lp_balance_snapshots(owner_address, block_index DESC);

CREATE TABLE IF NOT EXISTS pool_fee_accruals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_match_tx_hash TEXT NOT NULL,
  order_tx_hash TEXT,
  event_index INTEGER NOT NULL,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  address TEXT NOT NULL,
  holder TEXT NOT NULL,
  holder_type TEXT NOT NULL DEFAULT 'address',
  owner_address TEXT,
  fee_asset TEXT NOT NULL,
  fee_quantity_raw INTEGER NOT NULL,
  fee_quantity REAL NOT NULL,
  lp_balance_raw INTEGER NOT NULL,
  total_lp_supply_raw INTEGER NOT NULL,
  UNIQUE(event_index, holder, fee_asset)
);

CREATE INDEX IF NOT EXISTS idx_pool_fee_accruals_address ON pool_fee_accruals(address, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_fee_accruals_owner ON pool_fee_accruals(owner_address, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_fee_accruals_lp ON pool_fee_accruals(lp_asset, block_time DESC);

CREATE TABLE IF NOT EXISTS pool_address_fee_totals (
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  address TEXT NOT NULL,
  holder TEXT NOT NULL,
  holder_type TEXT NOT NULL DEFAULT 'address',
  owner_address TEXT,
  fee_asset TEXT NOT NULL,
  fee_quantity_raw INTEGER NOT NULL DEFAULT 0,
  fee_quantity REAL NOT NULL DEFAULT 0,
  updated_block_index INTEGER,
  updated_block_time INTEGER,
  PRIMARY KEY (lp_asset, holder, fee_asset)
);

CREATE INDEX IF NOT EXISTS idx_pool_address_fee_totals_address ON pool_address_fee_totals(address);
CREATE INDEX IF NOT EXISTS idx_pool_address_fee_totals_owner ON pool_address_fee_totals(owner_address);
