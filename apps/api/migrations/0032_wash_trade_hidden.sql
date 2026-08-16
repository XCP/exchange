-- Populate pair_stats.hidden, which has been dead since migration 0006.
--
-- The column was added with DEFAULT 0 and nothing has ever set it to 1, so
-- the site's "Hide low quality" toggle has been filtering markets on a flag
-- that is always false. NAJBEZ_XCP sat second on the homepage by all-time XCP
-- volume with the toggle ON; 116 of its 118 trades have the same address on
-- both sides.
--
-- The rule is the explorer's, so the two products agree on what "low quality"
-- means: a market is hidden when at least half its trades are self-trades and
-- it has enough trades for that ratio to mean something. Below 30 trades the
-- percentage is noise — one wash trade in a market with two makes 50%.
--
-- Self-trade is maker = taker on the same match: one party on both sides,
-- which moves no value and exists to manufacture volume and price.
ALTER TABLE pair_stats ADD COLUMN self_trade_pct REAL DEFAULT 0;

UPDATE pair_stats SET
  self_trade_pct = COALESCE((
    SELECT SUM(CASE WHEN t.maker = t.taker THEN 1.0 ELSE 0 END) * 100.0 / COUNT(*)
    FROM trades t WHERE t.pair = pair_stats.pair
  ), 0);

UPDATE pair_stats SET hidden = 1
  WHERE self_trade_pct >= 50 AND total_trade_count >= 30;

CREATE INDEX IF NOT EXISTS idx_pair_stats_selftrade ON pair_stats(self_trade_pct);
