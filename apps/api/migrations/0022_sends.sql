CREATE TABLE sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  asset TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  quantity REAL NOT NULL,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  UNIQUE(tx_hash, asset)
);
CREATE INDEX idx_sends_asset_time ON sends(asset, block_time DESC);
CREATE INDEX idx_sends_block ON sends(block_index);
