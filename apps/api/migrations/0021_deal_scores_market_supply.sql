-- Add market-wide supply metrics per asset to deal_scores
ALTER TABLE deal_scores ADD COLUMN market_total_qty INTEGER;
ALTER TABLE deal_scores ADD COLUMN market_listing_count INTEGER;
