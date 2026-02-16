ALTER TABLE dispenser_stats ADD COLUMN hidden INTEGER DEFAULT 0;
UPDATE dispenser_stats SET hidden = 1 WHERE asset IN ('OXBT', 'ORDIPEPE', 'OGPASS');
