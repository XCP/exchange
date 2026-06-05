-- AMM pool indexing from Counterparty pool events.

CREATE TABLE IF NOT EXISTS pools (
  lp_asset TEXT PRIMARY KEY,
  pair TEXT NOT NULL UNIQUE,
  asset_a TEXT NOT NULL,
  asset_b TEXT NOT NULL,
  reserve_a_raw INTEGER NOT NULL DEFAULT 0,
  reserve_b_raw INTEGER NOT NULL DEFAULT 0,
  reserve_a REAL NOT NULL DEFAULT 0,
  reserve_b REAL NOT NULL DEFAULT 0,
  opened_tx_hash TEXT,
  opened_block_index INTEGER,
  opened_block_time INTEGER,
  last_tx_hash TEXT,
  last_block_index INTEGER,
  last_block_time INTEGER,
  deposit_count INTEGER NOT NULL DEFAULT 0,
  withdrawal_count INTEGER NOT NULL DEFAULT 0,
  match_count INTEGER NOT NULL DEFAULT 0,
  restart_count INTEGER NOT NULL DEFAULT 0,
  total_fees_a_raw INTEGER NOT NULL DEFAULT 0,
  total_fees_b_raw INTEGER NOT NULL DEFAULT 0,
  total_fees_a REAL NOT NULL DEFAULT 0,
  total_fees_b REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pools_pair ON pools(pair);
CREATE INDEX IF NOT EXISTS idx_pools_asset_a ON pools(asset_a);
CREATE INDEX IF NOT EXISTS idx_pools_asset_b ON pools(asset_b);
CREATE INDEX IF NOT EXISTS idx_pools_match_count ON pools(match_count DESC);

CREATE TABLE IF NOT EXISTS pool_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  tx_index INTEGER,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  asset_a TEXT NOT NULL,
  asset_b TEXT NOT NULL,
  reserve_a_raw INTEGER NOT NULL DEFAULT 0,
  reserve_b_raw INTEGER NOT NULL DEFAULT 0,
  reserve_a REAL NOT NULL DEFAULT 0,
  reserve_b REAL NOT NULL DEFAULT 0,
  UNIQUE(event_index)
);

CREATE INDEX IF NOT EXISTS idx_pool_updates_lp_block ON pool_updates(lp_asset, block_index);
CREATE INDEX IF NOT EXISTS idx_pool_updates_block ON pool_updates(block_index);

CREATE TABLE IF NOT EXISTS pool_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  tx_index INTEGER,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  source TEXT NOT NULL,
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  asset_a TEXT NOT NULL,
  asset_b TEXT NOT NULL,
  quantity_a_raw INTEGER NOT NULL DEFAULT 0,
  quantity_b_raw INTEGER NOT NULL DEFAULT 0,
  quantity_minted_raw INTEGER NOT NULL DEFAULT 0,
  quantity_a REAL NOT NULL DEFAULT 0,
  quantity_b REAL NOT NULL DEFAULT 0,
  quantity_minted REAL NOT NULL DEFAULT 0,
  is_restart INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  UNIQUE(event_index)
);

CREATE INDEX IF NOT EXISTS idx_pool_deposits_lp_time ON pool_deposits(lp_asset, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_deposits_source_time ON pool_deposits(source, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_deposits_block ON pool_deposits(block_index);
CREATE INDEX IF NOT EXISTS idx_pool_deposits_tx_hash ON pool_deposits(tx_hash);

CREATE TABLE IF NOT EXISTS pool_withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  tx_index INTEGER,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  source TEXT NOT NULL,
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  asset_a TEXT NOT NULL,
  asset_b TEXT NOT NULL,
  quantity_destroyed_raw INTEGER NOT NULL DEFAULT 0,
  quantity_a_raw INTEGER NOT NULL DEFAULT 0,
  quantity_b_raw INTEGER NOT NULL DEFAULT 0,
  quantity_destroyed REAL NOT NULL DEFAULT 0,
  quantity_a REAL NOT NULL DEFAULT 0,
  quantity_b REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  UNIQUE(event_index)
);

CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_lp_time ON pool_withdrawals(lp_asset, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_source_time ON pool_withdrawals(source, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_block ON pool_withdrawals(block_index);
CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_tx_hash ON pool_withdrawals(tx_hash);

CREATE TABLE IF NOT EXISTS pool_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  tx_index INTEGER,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  source TEXT NOT NULL,
  lp_asset TEXT NOT NULL,
  pair TEXT NOT NULL,
  asset_a TEXT NOT NULL,
  asset_b TEXT NOT NULL,
  forward_asset TEXT NOT NULL,
  backward_asset TEXT NOT NULL,
  forward_quantity_raw INTEGER NOT NULL DEFAULT 0,
  backward_quantity_raw INTEGER NOT NULL DEFAULT 0,
  forward_quantity REAL NOT NULL DEFAULT 0,
  backward_quantity REAL NOT NULL DEFAULT 0,
  fee_asset TEXT NOT NULL,
  fee_quantity_raw INTEGER NOT NULL DEFAULT 0,
  fee_quantity REAL NOT NULL DEFAULT 0,
  fee_bps INTEGER NOT NULL DEFAULT 0,
  order_tx_hash TEXT,
  status TEXT NOT NULL,
  UNIQUE(event_index)
);

CREATE INDEX IF NOT EXISTS idx_pool_matches_lp_time ON pool_matches(lp_asset, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_matches_source_time ON pool_matches(source, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_matches_block ON pool_matches(block_index);
