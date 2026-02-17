-- PSBT-based atomic swap listings
CREATE TABLE swap_listings (
  id              TEXT PRIMARY KEY,
  seller_address  TEXT NOT NULL,
  asset           TEXT NOT NULL,
  asset_longname  TEXT,
  asset_quantity   INTEGER NOT NULL,
  utxo_txid       TEXT NOT NULL,
  utxo_vout       INTEGER NOT NULL,
  price_sats      INTEGER NOT NULL,
  psbt_hex        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  buyer_address   TEXT,
  tx_id           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT
);

-- Only one active listing per UTXO
CREATE UNIQUE INDEX idx_swap_listings_utxo_active
  ON swap_listings(utxo_txid, utxo_vout)
  WHERE status = 'active';

CREATE INDEX idx_swap_listings_status ON swap_listings(status);
CREATE INDEX idx_swap_listings_asset ON swap_listings(asset, status);
CREATE INDEX idx_swap_listings_seller ON swap_listings(seller_address, status);
CREATE INDEX idx_swap_listings_created ON swap_listings(created_at DESC);

-- Track in-flight purchases awaiting confirmation
CREATE TABLE swap_fills (
  id                TEXT PRIMARY KEY,
  swap_listing_id   TEXT NOT NULL REFERENCES swap_listings(id),
  buyer_address     TEXT NOT NULL,
  tx_id             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_swap_fills_listing ON swap_fills(swap_listing_id);
CREATE INDEX idx_swap_fills_status ON swap_fills(status);
CREATE INDEX idx_swap_fills_tx ON swap_fills(tx_id);
