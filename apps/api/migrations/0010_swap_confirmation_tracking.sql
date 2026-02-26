-- Add broadcast txid tracking to swap_listings
ALTER TABLE swap_listings ADD COLUMN broadcast_txid TEXT;

-- Add confirmation timestamp to swap_fills
ALTER TABLE swap_fills ADD COLUMN confirmed_at TEXT;
