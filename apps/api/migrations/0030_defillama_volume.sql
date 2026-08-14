-- DefiLlama requests arbitrary historical windows, including hourly slices.
-- Trades already have (quote_asset, block_time); dispensers need a time-first
-- index so these public aggregation requests do not scan full history.
CREATE INDEX IF NOT EXISTS idx_dispenses_time ON dispenses(block_time);
