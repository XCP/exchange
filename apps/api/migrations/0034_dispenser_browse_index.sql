-- The same defect migration 0033 fixed on pair_stats, on dispenser_stats.
--
-- `/dispenser-stats?sort=volume_24h&order=desc` is issued with a fixed sort by
-- the dispenser leaderboard. SQLite's best option was
-- `idx_dispenser_stats_hidden` — 18,211 rows, of which nearly all have
-- hidden = 0 — plus USE TEMP B-TREE FOR ORDER BY. Measured: 18,223 rows read
-- to return 50.
--
-- Equality first, then the ORDER BY column. The two range predicates
-- (`active_dispensers > 0`, `dispense_count_24h > 0`) stay per-row filters:
-- they cannot precede the sort column without destroying the ordering, and
-- they cost little because an asset with 24h volume almost always has both.
--
-- 24h only. It is the window this route is called with, and dispenser_stats
-- carries a volume column per timeframe — indexing all four would quadruple
-- index weight on every stats refresh to serve windows nothing requests.
CREATE INDEX IF NOT EXISTS idx_dispenser_stats_browse_24h
  ON dispenser_stats(hidden, volume_24h DESC);
