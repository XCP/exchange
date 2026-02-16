-- All-time dispenser metrics
ALTER TABLE dispenser_stats ADD COLUMN total_btc_spent REAL DEFAULT 0;
ALTER TABLE dispenser_stats ADD COLUMN total_dispensed REAL DEFAULT 0;
ALTER TABLE dispenser_stats ADD COLUMN total_dispense_count INTEGER DEFAULT 0;
ALTER TABLE dispenser_stats ADD COLUMN unique_buyers INTEGER DEFAULT 0;
ALTER TABLE dispenser_stats ADD COLUMN unique_sellers INTEGER DEFAULT 0;
ALTER TABLE dispenser_stats ADD COLUMN total_dispensers_created INTEGER DEFAULT 0;
ALTER TABLE dispenser_stats ADD COLUMN avg_dispense_btc REAL DEFAULT 0;

-- All-time pair metrics
ALTER TABLE pair_stats ADD COLUMN total_volume REAL DEFAULT 0;
ALTER TABLE pair_stats ADD COLUMN total_trade_count INTEGER DEFAULT 0;
ALTER TABLE pair_stats ADD COLUMN unique_traders INTEGER DEFAULT 0;
ALTER TABLE pair_stats ADD COLUMN all_time_high REAL;
ALTER TABLE pair_stats ADD COLUMN all_time_low REAL;
