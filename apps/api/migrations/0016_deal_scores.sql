-- Pre-computed deal scores for the /deals endpoint.
-- Populated by the indexer alongside pair_stats/dispenser_stats refresh.
CREATE TABLE IF NOT EXISTS deal_scores (
  asset TEXT NOT NULL,
  quote TEXT NOT NULL,
  asset_longname TEXT,

  -- Fair value (median of last 10 trades in this quote)
  fair_value REAL,
  fair_value_method TEXT,    -- e.g. "median_10"
  last_price REAL,
  highest_price REAL,
  lowest_price REAL,
  average_price REAL,
  median_price REAL,

  -- Recent sales JSON: [{price, amount, date, side}] (last 5)
  recent_sales_json TEXT,

  -- Current cheapest listing on this pair
  cheapest_listing_price REAL,
  cheapest_listing_type TEXT,  -- 'order' or 'dispenser' or null
  cheapest_listing_qty REAL,
  discount_pct REAL,

  -- Dispenser context (BTC-priced)
  dispenser_cheapest_btc REAL,
  dispenser_last_price_btc REAL,
  dispenser_active INTEGER DEFAULT 0,
  dispenser_unique_buyers INTEGER DEFAULT 0,

  -- Liquidity & frequency
  total_trades INTEGER DEFAULT 0,
  avg_days_between_trades REAL,
  last_trade_days_ago REAL,
  active_buy_orders INTEGER DEFAULT 0,
  unique_traders INTEGER DEFAULT 0,

  -- Scoring
  score INTEGER DEFAULT 0,
  required_edge_pct INTEGER DEFAULT 50,

  -- Collections JSON: [{slug, name}]
  collections_json TEXT,

  updated_at INTEGER,

  PRIMARY KEY (asset, quote)
);

CREATE INDEX IF NOT EXISTS idx_deal_scores_score ON deal_scores(score DESC);
