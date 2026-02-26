-- Track in-flight fill requests with TTL to prevent replay
CREATE TABLE swap_fill_requests (
  id              TEXT PRIMARY KEY,
  swap_listing_id TEXT NOT NULL REFERENCES swap_listings(id),
  buyer_address   TEXT NOT NULL,
  buyer_psbt_hex  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT NOT NULL
);

CREATE INDEX idx_fill_requests_listing ON swap_fill_requests(swap_listing_id, status);
CREATE INDEX idx_fill_requests_expires ON swap_fill_requests(expires_at);

-- Add locking column to swap_listings for fill-in-progress
ALTER TABLE swap_listings ADD COLUMN locked_until TEXT;
