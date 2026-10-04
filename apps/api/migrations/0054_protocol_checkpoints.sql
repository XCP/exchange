-- Existing checkpoints have no historical protocol evidence. Do not invent it.
ALTER TABLE indexer_block_checkpoints ADD COLUMN ledger_hash TEXT;
ALTER TABLE indexer_block_checkpoints ADD COLUMN messages_hash TEXT;
