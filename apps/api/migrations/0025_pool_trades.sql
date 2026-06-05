-- Mark whether a trade came from an order match or an AMM pool match.
-- Pool matches can share tx hashes, so uniqueness stays on match_id.

ALTER TABLE trades ADD COLUMN source_type TEXT NOT NULL DEFAULT 'order';
ALTER TABLE trades ADD COLUMN lp_asset TEXT;
ALTER TABLE trades ADD COLUMN order_tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_trades_source_type ON trades(source_type, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_lp_asset ON trades(lp_asset, block_time DESC);
