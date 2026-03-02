CREATE INDEX IF NOT EXISTS idx_pair_stats_hidden ON pair_stats(hidden);
CREATE INDEX IF NOT EXISTS idx_dispenser_stats_hidden ON dispenser_stats(hidden, asset);
