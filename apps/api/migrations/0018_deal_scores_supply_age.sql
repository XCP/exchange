-- Add supply, listing age, and composite index for incremental scoring
ALTER TABLE deal_scores ADD COLUMN supply REAL;
ALTER TABLE deal_scores ADD COLUMN listing_block_time INTEGER;

CREATE INDEX IF NOT EXISTS idx_deal_scores_asset_quote_type ON deal_scores(asset, quote, listing_type);
