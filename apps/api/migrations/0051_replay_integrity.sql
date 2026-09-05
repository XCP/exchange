-- Keep a small verified checkpoint history, not a second chain index.
CREATE TABLE indexer_block_checkpoints (
  block_index INTEGER PRIMARY KEY,
  block_hash TEXT NOT NULL,
  block_time INTEGER NOT NULL
);

CREATE INDEX idx_pool_lp_events_block ON pool_lp_balance_events(block_index);

-- The history row and its balance effect must be one SQLite statement.
-- INSERT OR IGNORE on replay then has no second balance effect. Preserve
-- existing opening balances; retained LP event history may start after them.
-- Use RAISE ... WHERE, not bare CASE ... END: the remote D1 parser can
-- mistake CASE's END for the trigger terminator (workers-sdk issue 4727).
CREATE TRIGGER pool_lp_event_insert AFTER INSERT ON pool_lp_balance_events
BEGIN
  INSERT INTO pool_lp_balances
    (lp_asset, pair, address, holder, holder_type, owner_address,
     balance_raw, balance, updated_block_index, updated_block_time)
  VALUES (NEW.lp_asset, NEW.pair, NEW.address, NEW.holder, NEW.holder_type,
          NEW.owner_address, NEW.delta_raw, NEW.delta, NEW.block_index, NEW.block_time)
  ON CONFLICT(lp_asset, holder) DO UPDATE SET
    pair = excluded.pair, address = excluded.address,
    holder_type = excluded.holder_type, owner_address = excluded.owner_address,
    balance_raw = pool_lp_balances.balance_raw + excluded.balance_raw,
    balance = pool_lp_balances.balance + excluded.balance,
    updated_block_index = excluded.updated_block_index,
    updated_block_time = excluded.updated_block_time;
  SELECT RAISE(ABORT, 'LP balance underflow') FROM pool_lp_balances
    WHERE lp_asset = NEW.lp_asset AND holder = NEW.holder AND balance_raw < 0;
  SELECT RAISE(ABORT, 'Unsafe LP balance quantity') FROM pool_lp_balances
    WHERE lp_asset = NEW.lp_asset AND holder = NEW.holder AND balance_raw > 9007199254740991;
END;

-- Reorgs reverse only removed events, never reconstruct a baseline from zero.
CREATE TRIGGER pool_lp_event_delete AFTER DELETE ON pool_lp_balance_events
BEGIN
  SELECT RAISE(ABORT, 'Missing LP balance for rollback') WHERE NOT EXISTS (
    SELECT 1 FROM pool_lp_balances WHERE lp_asset = OLD.lp_asset AND holder = OLD.holder
  );
  UPDATE pool_lp_balances SET
    balance_raw = balance_raw - OLD.delta_raw,
    balance = balance - OLD.delta
  WHERE lp_asset = OLD.lp_asset AND holder = OLD.holder;
END;
