CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  tag_type TEXT NOT NULL,
  assets_count INTEGER DEFAULT 0,
  open_orders_count INTEGER DEFAULT 0,
  open_dispensers_count INTEGER DEFAULT 0,
  UNIQUE(tag_type, slug)
);

CREATE TABLE tag_assets (
  tag_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  PRIMARY KEY (tag_id, asset),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX idx_tag_assets_asset ON tag_assets(asset);
CREATE INDEX idx_tags_type ON tags(tag_type);
