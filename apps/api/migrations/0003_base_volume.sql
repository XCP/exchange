-- Base asset volume columns (amount-denominated, vs existing quote-denominated volume)
ALTER TABLE pair_stats ADD COLUMN base_volume_24h REAL DEFAULT 0;
ALTER TABLE pair_stats ADD COLUMN base_volume_7d REAL DEFAULT 0;
ALTER TABLE pair_stats ADD COLUMN base_volume_30d REAL DEFAULT 0;
ALTER TABLE pair_stats ADD COLUMN total_base_volume REAL DEFAULT 0;
