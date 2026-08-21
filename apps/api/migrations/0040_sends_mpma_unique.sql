-- UNIQUE(tx_hash, asset) assumed one transaction sends a given asset to at
-- most one destination -- but MPMA_SEND's whole purpose is many legs in one
-- tx, and its commonest shape (one asset airdropped to N addresses) produces
-- N events with identical (tx_hash, asset) and different destinations.
-- INSERT OR IGNORE kept leg 1 and silently discarded legs 2..N, while the
-- insert counter still reported all N. Rebuild keyed per leg.
--
-- The rebuild is CHUNKED across 0040-0047: a one-shot copy of 1.5M rows
-- exceeded D1's per-execution CPU limit. This file creates the new table
-- and copies the first id range; 0047 copies the open tail and performs the
-- swap atomically, so rows written between chunks are never lost.
--
-- Legs already dropped are NOT recoverable here -- they were never written.
-- They backfill naturally if the affected blocks are ever replayed; the
-- table's one consumer is the daily activity chart, which undercounted.
CREATE TABLE sends_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  asset TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  quantity REAL NOT NULL,
  block_index INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  UNIQUE(tx_hash, asset, destination)
);

INSERT INTO sends_new (id, tx_hash, asset, source, destination, quantity, block_index, block_time)
SELECT id, tx_hash, asset, source, destination, quantity, block_index, block_time
FROM sends WHERE id <= 500000;
