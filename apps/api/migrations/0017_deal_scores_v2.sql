-- Redesign: each deal IS a buyable listing (order or dispenser), not a pair.
-- Multiple deals per asset possible (different listings at different prices).
DROP TABLE IF EXISTS deal_scores;

CREATE TABLE deal_scores (
  listing_id TEXT NOT NULL,          -- tx_hash of order or dispenser
  listing_type TEXT NOT NULL,        -- 'order' or 'dispenser'
  asset TEXT NOT NULL,
  quote TEXT NOT NULL,               -- XCP/PEPECASH/BITCORN for orders, BTC for dispensers
  asset_longname TEXT,

  -- This listing
  listing_price REAL NOT NULL,
  listing_qty REAL,
  listing_source TEXT,

  -- Fair value (median of last 10 trades/dispenses in this quote)
  fair_value REAL,
  fair_value_method TEXT,
  discount_pct REAL,

  -- Price context
  last_price REAL,
  highest_price REAL,
  lowest_price REAL,
  average_price REAL,
  median_price REAL,
  recent_sales_json TEXT,

  -- Liquidity & frequency
  total_trades INTEGER DEFAULT 0,
  avg_days_between_trades REAL,
  last_trade_days_ago REAL,
  unique_traders INTEGER DEFAULT 0,
  active_buy_orders INTEGER DEFAULT 0,

  -- Dispenser context (BTC-priced, asset-level)
  dispenser_cheapest_btc REAL,
  dispenser_active INTEGER DEFAULT 0,
  dispenser_unique_buyers INTEGER DEFAULT 0,

  -- Scoring
  score INTEGER DEFAULT 0,
  required_edge_pct INTEGER DEFAULT 50,

  -- Collections
  collections_json TEXT,

  updated_at INTEGER,

  PRIMARY KEY (listing_type, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_scores_score ON deal_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_deal_scores_asset ON deal_scores(asset);
CREATE INDEX IF NOT EXISTS idx_deal_scores_quote ON deal_scores(quote);
