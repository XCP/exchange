-- Add AI context fields: confidence, warning flags, median3 divergence
ALTER TABLE deal_scores ADD COLUMN score_confidence TEXT DEFAULT 'LOW';
ALTER TABLE deal_scores ADD COLUMN warning_flags_json TEXT;
ALTER TABLE deal_scores ADD COLUMN median3 REAL;
ALTER TABLE deal_scores ADD COLUMN total_trade_volume REAL;
