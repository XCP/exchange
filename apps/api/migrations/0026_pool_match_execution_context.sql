-- Native AMM execution context for pool matches.

ALTER TABLE pool_matches ADD COLUMN reserve_a_before REAL;
ALTER TABLE pool_matches ADD COLUMN reserve_b_before REAL;
ALTER TABLE pool_matches ADD COLUMN reserve_a_after REAL;
ALTER TABLE pool_matches ADD COLUMN reserve_b_after REAL;
ALTER TABLE pool_matches ADD COLUMN effective_price REAL;
ALTER TABLE pool_matches ADD COLUMN price_before REAL;
ALTER TABLE pool_matches ADD COLUMN price_after REAL;
