-- Bounded before-images for mutable chain state. The context row exists only
-- inside the same D1 transaction as the indexed writes, never between batches.
CREATE TABLE reorg_undo_context (singleton INTEGER PRIMARY KEY CHECK(singleton=1), block_index INTEGER NOT NULL);
CREATE TABLE reorg_undo_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), floor INTEGER NOT NULL);
CREATE TABLE reorg_undo (seq INTEGER PRIMARY KEY AUTOINCREMENT, block_index INTEGER NOT NULL, table_name TEXT NOT NULL, row_key TEXT NOT NULL, before_row TEXT);
CREATE INDEX idx_reorg_undo_block ON reorg_undo(block_index,seq);

CREATE TRIGGER reorg_undo_orders_insert AFTER INSERT ON orders
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1)
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'orders',json_object('tx_hash',NEW."tx_hash"),NULL FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_orders_update AFTER UPDATE ON orders
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1) AND (OLD."tx_hash" IS NOT NEW."tx_hash" OR OLD."tx_index" IS NOT NEW."tx_index" OR OLD."pair" IS NOT NEW."pair" OR OLD."base_asset" IS NOT NEW."base_asset" OR OLD."quote_asset" IS NOT NEW."quote_asset" OR OLD."source" IS NOT NEW."source" OR OLD."side" IS NOT NEW."side" OR OLD."price" IS NOT NEW."price" OR OLD."amount" IS NOT NEW."amount" OR OLD."give_remaining" IS NOT NEW."give_remaining" OR OLD."get_remaining" IS NOT NEW."get_remaining" OR OLD."expiration" IS NOT NEW."expiration" OR OLD."expire_index" IS NOT NEW."expire_index" OR OLD."block_index" IS NOT NEW."block_index" OR OLD."block_time" IS NOT NEW."block_time" OR OLD."status" IS NOT NEW."status" OR OLD."first_seen_at" IS NOT NEW."first_seen_at" OR OLD."closed_at" IS NOT NEW."closed_at" OR OLD."give_quantity" IS NOT NEW."give_quantity" OR OLD."get_quantity" IS NOT NEW."get_quantity" OR OLD."remaining" IS NOT NEW."remaining")
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'orders',json_object('tx_hash',OLD."tx_hash"),json_object('tx_hash',OLD."tx_hash",'tx_index',OLD."tx_index",'pair',OLD."pair",'base_asset',OLD."base_asset",'quote_asset',OLD."quote_asset",'source',OLD."source",'side',OLD."side",'price',OLD."price",'amount',OLD."amount",'give_remaining',OLD."give_remaining",'get_remaining',OLD."get_remaining",'expiration',OLD."expiration",'expire_index',OLD."expire_index",'block_index',OLD."block_index",'block_time',OLD."block_time",'status',OLD."status",'first_seen_at',OLD."first_seen_at",'closed_at',OLD."closed_at",'give_quantity',OLD."give_quantity",'get_quantity',OLD."get_quantity",'remaining',OLD."remaining") FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_orders_delete AFTER DELETE ON orders
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1)
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'orders',json_object('tx_hash',OLD."tx_hash"),json_object('tx_hash',OLD."tx_hash",'tx_index',OLD."tx_index",'pair',OLD."pair",'base_asset',OLD."base_asset",'quote_asset',OLD."quote_asset",'source',OLD."source",'side',OLD."side",'price',OLD."price",'amount',OLD."amount",'give_remaining',OLD."give_remaining",'get_remaining',OLD."get_remaining",'expiration',OLD."expiration",'expire_index',OLD."expire_index",'block_index',OLD."block_index",'block_time',OLD."block_time",'status',OLD."status",'first_seen_at',OLD."first_seen_at",'closed_at',OLD."closed_at",'give_quantity',OLD."give_quantity",'get_quantity',OLD."get_quantity",'remaining',OLD."remaining") FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_dispensers_insert AFTER INSERT ON dispensers
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1)
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'dispensers',json_object('tx_hash',NEW."tx_hash"),NULL FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_dispensers_update AFTER UPDATE ON dispensers
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1) AND (OLD."tx_hash" IS NOT NEW."tx_hash" OR OLD."tx_index" IS NOT NEW."tx_index" OR OLD."asset" IS NOT NEW."asset" OR OLD."source" IS NOT NEW."source" OR OLD."give_quantity" IS NOT NEW."give_quantity" OR OLD."escrow_quantity" IS NOT NEW."escrow_quantity" OR OLD."give_remaining" IS NOT NEW."give_remaining" OR OLD."satoshi_price" IS NOT NEW."satoshi_price" OR OLD."price" IS NOT NEW."price" OR OLD."dispense_count" IS NOT NEW."dispense_count" OR OLD."status" IS NOT NEW."status" OR OLD."block_index" IS NOT NEW."block_index" OR OLD."block_time" IS NOT NEW."block_time" OR OLD."oracle_address" IS NOT NEW."oracle_address" OR OLD."first_seen_at" IS NOT NEW."first_seen_at" OR OLD."closed_at" IS NOT NEW."closed_at")
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'dispensers',json_object('tx_hash',OLD."tx_hash"),json_object('tx_hash',OLD."tx_hash",'tx_index',OLD."tx_index",'asset',OLD."asset",'source',OLD."source",'give_quantity',OLD."give_quantity",'escrow_quantity',OLD."escrow_quantity",'give_remaining',OLD."give_remaining",'satoshi_price',OLD."satoshi_price",'price',OLD."price",'dispense_count',OLD."dispense_count",'status',OLD."status",'block_index',OLD."block_index",'block_time',OLD."block_time",'oracle_address',OLD."oracle_address",'first_seen_at',OLD."first_seen_at",'closed_at',OLD."closed_at") FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_dispensers_delete AFTER DELETE ON dispensers
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1)
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'dispensers',json_object('tx_hash',OLD."tx_hash"),json_object('tx_hash',OLD."tx_hash",'tx_index',OLD."tx_index",'asset',OLD."asset",'source',OLD."source",'give_quantity',OLD."give_quantity",'escrow_quantity',OLD."escrow_quantity",'give_remaining',OLD."give_remaining",'satoshi_price',OLD."satoshi_price",'price',OLD."price",'dispense_count',OLD."dispense_count",'status',OLD."status",'block_index',OLD."block_index",'block_time',OLD."block_time",'oracle_address',OLD."oracle_address",'first_seen_at',OLD."first_seen_at",'closed_at',OLD."closed_at") FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_pools_insert AFTER INSERT ON pools
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1)
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'pools',json_object('lp_asset',NEW."lp_asset"),NULL FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_pools_update AFTER UPDATE ON pools
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1) AND (OLD."lp_asset" IS NOT NEW."lp_asset" OR OLD."pair" IS NOT NEW."pair" OR OLD."asset_a" IS NOT NEW."asset_a" OR OLD."asset_b" IS NOT NEW."asset_b" OR OLD."reserve_a_raw" IS NOT NEW."reserve_a_raw" OR OLD."reserve_b_raw" IS NOT NEW."reserve_b_raw" OR OLD."reserve_a" IS NOT NEW."reserve_a" OR OLD."reserve_b" IS NOT NEW."reserve_b" OR OLD."opened_tx_hash" IS NOT NEW."opened_tx_hash" OR OLD."opened_block_index" IS NOT NEW."opened_block_index" OR OLD."opened_block_time" IS NOT NEW."opened_block_time" OR OLD."last_tx_hash" IS NOT NEW."last_tx_hash" OR OLD."last_block_index" IS NOT NEW."last_block_index" OR OLD."last_block_time" IS NOT NEW."last_block_time" OR OLD."deposit_count" IS NOT NEW."deposit_count" OR OLD."withdrawal_count" IS NOT NEW."withdrawal_count" OR OLD."match_count" IS NOT NEW."match_count" OR OLD."restart_count" IS NOT NEW."restart_count" OR OLD."total_fees_a_raw" IS NOT NEW."total_fees_a_raw" OR OLD."total_fees_b_raw" IS NOT NEW."total_fees_b_raw" OR OLD."total_fees_a" IS NOT NEW."total_fees_a" OR OLD."total_fees_b" IS NOT NEW."total_fees_b" OR OLD."updated_at" IS NOT NEW."updated_at")
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'pools',json_object('lp_asset',OLD."lp_asset"),json_object('lp_asset',OLD."lp_asset",'pair',OLD."pair",'asset_a',OLD."asset_a",'asset_b',OLD."asset_b",'reserve_a_raw',OLD."reserve_a_raw",'reserve_b_raw',OLD."reserve_b_raw",'reserve_a',OLD."reserve_a",'reserve_b',OLD."reserve_b",'opened_tx_hash',OLD."opened_tx_hash",'opened_block_index',OLD."opened_block_index",'opened_block_time',OLD."opened_block_time",'last_tx_hash',OLD."last_tx_hash",'last_block_index',OLD."last_block_index",'last_block_time',OLD."last_block_time",'deposit_count',OLD."deposit_count",'withdrawal_count',OLD."withdrawal_count",'match_count',OLD."match_count",'restart_count',OLD."restart_count",'total_fees_a_raw',OLD."total_fees_a_raw",'total_fees_b_raw',OLD."total_fees_b_raw",'total_fees_a',OLD."total_fees_a",'total_fees_b',OLD."total_fees_b",'updated_at',OLD."updated_at") FROM reorg_undo_context WHERE singleton=1;
END;

CREATE TRIGGER reorg_undo_pools_delete AFTER DELETE ON pools
WHEN EXISTS(SELECT 1 FROM reorg_undo_context WHERE singleton=1)
BEGIN
 INSERT INTO reorg_undo(block_index,table_name,row_key,before_row)
 SELECT block_index,'pools',json_object('lp_asset',OLD."lp_asset"),json_object('lp_asset',OLD."lp_asset",'pair',OLD."pair",'asset_a',OLD."asset_a",'asset_b',OLD."asset_b",'reserve_a_raw',OLD."reserve_a_raw",'reserve_b_raw',OLD."reserve_b_raw",'reserve_a',OLD."reserve_a",'reserve_b',OLD."reserve_b",'opened_tx_hash',OLD."opened_tx_hash",'opened_block_index',OLD."opened_block_index",'opened_block_time',OLD."opened_block_time",'last_tx_hash',OLD."last_tx_hash",'last_block_index',OLD."last_block_index",'last_block_time',OLD."last_block_time",'deposit_count',OLD."deposit_count",'withdrawal_count',OLD."withdrawal_count",'match_count',OLD."match_count",'restart_count',OLD."restart_count",'total_fees_a_raw',OLD."total_fees_a_raw",'total_fees_b_raw',OLD."total_fees_b_raw",'total_fees_a',OLD."total_fees_a",'total_fees_b',OLD."total_fees_b",'updated_at',OLD."updated_at") FROM reorg_undo_context WHERE singleton=1;
END;
