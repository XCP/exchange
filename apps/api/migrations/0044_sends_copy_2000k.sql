-- Part of the sends re-key (see 0040). The one-shot rebuild of 1.5M rows
-- exceeded D1's per-execution CPU limit, so the copy is split across
-- migration files: each applies as its own execution, well inside the
-- budget. This file copies one id range into sends_new.
INSERT INTO sends_new (id, tx_hash, asset, source, destination, quantity, block_index, block_time)
SELECT id, tx_hash, asset, source, destination, quantity, block_index, block_time
FROM sends WHERE id > 2000000 AND id <= 2500000;
