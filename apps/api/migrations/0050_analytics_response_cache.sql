-- A fixed set of popular public analytics variants, populated only by reads.
-- No index on expiry: key space is bounded and every lookup is a point seek.
CREATE TABLE analytics_response_cache (
  cache_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
