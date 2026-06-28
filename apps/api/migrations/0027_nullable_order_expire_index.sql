-- Counterparty can emit open orders with expiration=0 and expire_index=NULL.
-- Rebuild orders so expire_index can represent "no expiry" directly.

DROP INDEX IF EXISTS idx_orders_book;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_source_status;
DROP INDEX IF EXISTS idx_orders_block;

ALTER TABLE orders RENAME TO orders_old;

CREATE TABLE orders (
  tx_hash       TEXT PRIMARY KEY,
  tx_index      INTEGER NOT NULL,
  pair          TEXT NOT NULL,
  base_asset    TEXT NOT NULL,
  quote_asset   TEXT NOT NULL,
  source        TEXT NOT NULL,
  side          TEXT NOT NULL,
  price         REAL NOT NULL,
  amount        REAL NOT NULL,
  give_remaining REAL NOT NULL,
  get_remaining  REAL NOT NULL,
  expiration    INTEGER NOT NULL,
  expire_index  INTEGER,
  block_index   INTEGER NOT NULL,
  block_time    INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  first_seen_at INTEGER NOT NULL,
  closed_at     INTEGER,
  give_quantity REAL NOT NULL DEFAULT 0,
  get_quantity  REAL NOT NULL DEFAULT 0,
  remaining     REAL NOT NULL DEFAULT 0
);

INSERT INTO orders (
  tx_hash, tx_index, pair, base_asset, quote_asset, source, side,
  price, amount, give_remaining, get_remaining, expiration, expire_index,
  block_index, block_time, status, first_seen_at, closed_at,
  give_quantity, get_quantity, remaining
)
SELECT
  tx_hash, tx_index, pair, base_asset, quote_asset, source, side,
  price, amount, give_remaining, get_remaining, expiration,
  CASE
    WHEN expiration = 0 AND expire_index = 2147483647 THEN NULL
    ELSE expire_index
  END,
  block_index, block_time, status, first_seen_at, closed_at,
  give_quantity, get_quantity, remaining
FROM orders_old;

DROP TABLE orders_old;

CREATE INDEX idx_orders_book ON orders(pair, status, side, price);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_source_status ON orders(source, status);
CREATE INDEX idx_orders_block ON orders(block_index);
