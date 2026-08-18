-- Rank-by-counting on dispenser_stats, without scanning the table each time.
--
-- routes/asset-rankings.ts computes an asset's rank as "how many rank above
-- it" -- COUNT(*) ... WHERE col > ? -- three times against dispenser_stats.
-- Every one planned as `SCAN dispenser_stats`, reading all 18,217 rows to
-- count the 4,567 that qualify.
--
-- The route caches for 300s but keys per asset, so the saving is per distinct
-- asset viewed rather than per 5 minutes: each new asset paid all three scans.
--
-- Measured on production, total_dispense_count > 5:
--
--   before  SCAN dispenser_stats                       18,217 rows
--   after   SEARCH USING COVERING INDEX (col>?)         4,567 rows
--
-- Covering, so the table is never touched -- the count is answered from index
-- entries alone, and only the entries that actually match.
--
-- Deliberately NOT doing the same to pair_stats, which carries the other five
-- rank counts. It already answers them from a covering scan of
-- idx_pair_stats_base, so a dedicated index would save index entries rather
-- than row reads, and pair_stats is written on every order-book refresh --
-- roughly 78,000 times a day. Extra indexes there buy little and are billed on
-- every one of those writes. dispenser_stats is refreshed far less often, so
-- the trade goes the other way.
CREATE INDEX IF NOT EXISTS idx_dispenser_stats_rank_dispenses
  ON dispenser_stats(total_dispense_count);
CREATE INDEX IF NOT EXISTS idx_dispenser_stats_rank_btc
  ON dispenser_stats(total_btc_spent);
CREATE INDEX IF NOT EXISTS idx_dispenser_stats_rank_buyers
  ON dispenser_stats(unique_buyers);
