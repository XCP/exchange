-- Asset metadata indexed from Counterparty API
CREATE TABLE IF NOT EXISTS assets (
  asset TEXT PRIMARY KEY,
  asset_longname TEXT,
  issuer TEXT,
  owner TEXT,
  divisible INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  description_locked INTEGER NOT NULL DEFAULT 0,
  supply_normalized REAL,
  first_issuance_block_index INTEGER,
  first_issuance_block_time INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_updated ON assets(updated_at);
CREATE INDEX IF NOT EXISTS idx_assets_first_issuance ON assets(first_issuance_block_index DESC);
