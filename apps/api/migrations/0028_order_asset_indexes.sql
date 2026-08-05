-- The asset-activity endpoint counts orders per day WHERE base_asset = ? OR quote_asset = ?.
-- Every other branch of that union (trades, dispenses, dispensers, sends) has asset-leading
-- indexes; orders had none, so each asset-page request full-scanned the orders table
-- (~560k billed D1 rows per call, ~1.3B reads/day). With both sides indexed SQLite's
-- OR-optimization merges two narrow range scans instead.
CREATE INDEX IF NOT EXISTS idx_orders_base_asset ON orders (base_asset, block_time);

CREATE INDEX IF NOT EXISTS idx_orders_quote_asset ON orders (quote_asset, block_time);
