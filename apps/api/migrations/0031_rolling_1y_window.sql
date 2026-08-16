-- The 7d rolling window sat between 24h and 30d and told users almost nothing
-- those two didn't. A 1-year window is the one people actually reach for, so the
-- 7d slots are repurposed rather than adding a fourth set of columns: same
-- storage, same per-tick indexer cost, one fewer window in the UI.
--
-- Renaming leaves 7-day values sitting in the 1y columns until a sweep recomputes
-- them. refreshLongWindowPairStats / refreshLongWindowDispenserStats select on
-- last_trade_time within the year (not on the column values), so every row with a
-- trade in the last year is repriced on the first daily sweep after deploy.

ALTER TABLE pair_stats RENAME COLUMN price_change_7d TO price_change_1y;
ALTER TABLE pair_stats RENAME COLUMN volume_7d TO volume_1y;
ALTER TABLE pair_stats RENAME COLUMN base_volume_7d TO base_volume_1y;
ALTER TABLE pair_stats RENAME COLUMN high_7d TO high_1y;
ALTER TABLE pair_stats RENAME COLUMN low_7d TO low_1y;
ALTER TABLE pair_stats RENAME COLUMN trade_count_7d TO trade_count_1y;

ALTER TABLE dispenser_stats RENAME COLUMN price_change_7d TO price_change_1y;
ALTER TABLE dispenser_stats RENAME COLUMN volume_7d TO volume_1y;
ALTER TABLE dispenser_stats RENAME COLUMN high_7d TO high_1y;
ALTER TABLE dispenser_stats RENAME COLUMN low_7d TO low_1y;
ALTER TABLE dispenser_stats RENAME COLUMN dispense_count_7d TO dispense_count_1y;

-- The homepage markets table orders active markets by windowed quote volume.
CREATE INDEX IF NOT EXISTS idx_pair_stats_vol1y ON pair_stats(volume_1y DESC);
CREATE INDEX IF NOT EXISTS idx_pair_stats_vol30 ON pair_stats(volume_30d DESC);
CREATE INDEX IF NOT EXISTS idx_pair_stats_voltotal ON pair_stats(total_volume DESC);
