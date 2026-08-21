-- Finale of the sends re-key (see 0040): copy the open tail -- anything
-- written since the chunked copies, plus ids past the last range -- and
-- swap, in ONE file so it lands in one transaction and no send written
-- mid-rebuild can slip between the tail copy and the rename.
INSERT INTO sends_new (id, tx_hash, asset, source, destination, quantity, block_index, block_time)
SELECT id, tx_hash, asset, source, destination, quantity, block_index, block_time
FROM sends WHERE id > 3500000;

DROP TABLE sends;

ALTER TABLE sends_new RENAME TO sends;

CREATE INDEX idx_sends_asset_time ON sends(asset, block_time DESC);
CREATE INDEX idx_sends_block ON sends(block_index);
