-- Replaces the index added in 0034, which did not help. Recorded rather than
-- rewritten, because the reason is worth keeping.
--
-- 0034 indexed (hidden, volume_24h DESC) on the theory that ordering by the
-- sort column lets LIMIT 50 stop early. It removed the temp b-tree and moved
-- rows read by 15: 18,223 → 18,208.
--
-- The theory was wrong because only 15 rows in the table satisfy the query's
-- WHERE (`active_dispensers > 0 AND hidden = 0 AND dispense_count_24h > 0`)
-- while the LIMIT is 50. A LIMIT can only short-circuit a walk once it is
-- FILLED. With a result set smaller than the limit, the engine must reach the
-- end of the index to prove no further match exists — so ordering bought
-- nothing and the whole 18,211-entry index was walked either way.
--
-- The fix is to make the SELECTIVE predicate the seekable one. Seeking
-- hidden = 0 AND dispense_count_24h > 0 bounds the scan to ~15 entries; the
-- ORDER BY then sorts 15 rows in a temp b-tree, which is free. Trading a
-- sorted 18,211-row walk for an unsorted 15-row seek plus a trivial sort.
--
-- General rule for this codebase: index for the predicate that eliminates
-- rows, not for the ORDER BY, whenever the filtered set is smaller than the
-- page size. Check with
--   SELECT COUNT(*) FROM t WHERE <the query's WHERE>
-- before choosing the column order.
DROP INDEX IF EXISTS idx_dispenser_stats_browse_24h;

CREATE INDEX IF NOT EXISTS idx_dispenser_stats_active_24h
  ON dispenser_stats(hidden, dispense_count_24h, volume_24h DESC);
