-- Originally added time-only indexes for 24h scans in the CG/CMC integration
-- endpoints. The integration moved to an explicit pair allowlist whose queries
-- use the existing (pair, block_time) / (asset, block_time) indexes, so these
-- are not needed — and building them remotely would cost a one-time ~400K
-- index-row write. DROP IF EXISTS is a no-op where they were never created.
DROP INDEX IF EXISTS idx_trades_time;
DROP INDEX IF EXISTS idx_dispenses_time;
