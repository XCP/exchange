-- Payment-capped allocation across every asset released by each BTC output.
-- Raw btc_amount and price are retained for audit/replay; new columns are derived.
ALTER TABLE dispenses ADD COLUMN quote_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE dispenses ADD COLUMN execution_price REAL NOT NULL DEFAULT 0;
-- Zero marks rows written by an older Worker between migration and deployment.
ALTER TABLE dispenses ADD COLUMN payment_asset_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_dispenses_unaccounted ON dispenses(block_index) WHERE payment_asset_count = 0;

-- Same query as repriceDispensesSQL() in lib/dispense-accounting.ts.
WITH ordered AS (
    SELECT d.id, d.tx_hash, d.dispense_index, d.asset, d.source, d.destination,
           d.btc_amount, d.dispense_quantity,
           MAX(0, d.dispense_quantity * COALESCE(p.price,
             CASE WHEN d.dispense_quantity > 0 THEN d.btc_amount / d.dispense_quantity ELSE 0 END)) AS notional,
           LAG(d.asset) OVER tx AS previous_asset,
           LAG(d.source) OVER tx AS previous_source,
           LAG(d.destination) OVER tx AS previous_destination,
           LAG(d.btc_amount) OVER tx AS previous_payment
    FROM dispenses d LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
    WHERE 1 = 1
    WINDOW tx AS (PARTITION BY d.tx_hash ORDER BY d.dispense_index)
  ), grouped AS (
    SELECT *, SUM(CASE WHEN previous_asset IS NULL OR asset <= previous_asset
                      OR source IS NOT previous_source OR destination IS NOT previous_destination
                      OR btc_amount IS NOT previous_payment THEN 1 ELSE 0 END)
              OVER (PARTITION BY tx_hash ORDER BY dispense_index ROWS UNBOUNDED PRECEDING) AS payment_group
    FROM ordered
  ), totals AS (
    SELECT *, SUM(notional) OVER payment AS total_notional,
           COUNT(*) OVER payment AS asset_count
    FROM grouped
    WINDOW payment AS (PARTITION BY tx_hash, payment_group)
  ), allocated AS (
    SELECT id, dispense_quantity, asset_count,
           CASE WHEN total_notional > 0
             THEN notional * MIN(1.0, MAX(0, btc_amount) / total_notional)
             ELSE 0 END AS volume
    FROM totals
  )
  UPDATE dispenses SET quote_volume = a.volume,
    execution_price = CASE WHEN a.dispense_quantity > 0 THEN a.volume / a.dispense_quantity ELSE 0 END,
    payment_asset_count = a.asset_count
  FROM allocated a WHERE dispenses.id = a.id;

-- Rebuild historical and rolling stats once, not on every public request.
WITH corrected AS (
  SELECT asset, SUM(quote_volume) AS total_btc,
    AVG(quote_volume) AS average_btc,
    COALESCE(SUM(CASE WHEN block_time >= unixepoch() - 86400 THEN quote_volume END), 0) AS v24h,
    MAX(CASE WHEN block_time >= unixepoch() - 86400 THEN execution_price END) AS h24h,
    MIN(CASE WHEN block_time >= unixepoch() - 86400 THEN execution_price END) AS l24h,
    COALESCE(SUM(CASE WHEN block_time >= unixepoch() - 2592000 THEN quote_volume END), 0) AS v30d,
    MAX(CASE WHEN block_time >= unixepoch() - 2592000 THEN execution_price END) AS h30d,
    MIN(CASE WHEN block_time >= unixepoch() - 2592000 THEN execution_price END) AS l30d,
    COALESCE(SUM(CASE WHEN block_time >= unixepoch() - 31536000 THEN quote_volume END), 0) AS v1y,
    MAX(CASE WHEN block_time >= unixepoch() - 31536000 THEN execution_price END) AS h1y,
    MIN(CASE WHEN block_time >= unixepoch() - 31536000 THEN execution_price END) AS l1y,
    COUNT(*) AS fills
  FROM dispenses GROUP BY asset
)
UPDATE dispenser_stats SET total_btc_spent = c.total_btc, avg_dispense_btc = c.average_btc,
  volume_24h = c.v24h, high_24h = c.h24h, low_24h = c.l24h,
  volume_30d = c.v30d, high_30d = c.h30d, low_30d = c.l30d,
  volume_1y = c.v1y, high_1y = c.h1y, low_1y = c.l1y,
  last_dispense_price = (SELECT execution_price FROM dispenses d WHERE d.asset = dispenser_stats.asset
    ORDER BY block_time DESC, id DESC LIMIT 1),
  updated_at = unixepoch()
FROM corrected c WHERE dispenser_stats.asset = c.asset;

UPDATE dispenser_stats SET
  price_change_24h = COALESCE((SELECT CASE WHEN execution_price > 0
    THEN (dispenser_stats.last_dispense_price - execution_price) / execution_price * 100 ELSE 0 END
    FROM dispenses d WHERE d.asset = dispenser_stats.asset AND block_time <= unixepoch() - 86400
    ORDER BY block_time DESC, id DESC LIMIT 1), 0),
  price_change_30d = COALESCE((SELECT CASE WHEN execution_price > 0
    THEN (dispenser_stats.last_dispense_price - execution_price) / execution_price * 100 ELSE 0 END
    FROM dispenses d WHERE d.asset = dispenser_stats.asset AND block_time <= unixepoch() - 2592000
    ORDER BY block_time DESC, id DESC LIMIT 1), 0),
  price_change_1y = COALESCE((SELECT CASE WHEN execution_price > 0
    THEN (dispenser_stats.last_dispense_price - execution_price) / execution_price * 100 ELSE 0 END
    FROM dispenses d WHERE d.asset = dispenser_stats.asset AND block_time <= unixepoch() - 31536000
    ORDER BY block_time DESC, id DESC LIMIT 1), 0);

DELETE FROM analytics_response_cache;
-- Re-score bargains using the corrected history on the next indexer tick.
DELETE FROM indexer_state WHERE key = 'deal_scores_refreshed_at';
