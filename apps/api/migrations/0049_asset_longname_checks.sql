-- Numeric assets may authoritatively have no longname. Remember the result
-- instead of asking Core about the same first ten assets every two minutes.
CREATE TABLE asset_longname_checks (
  asset TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL,
  retry_after INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('no_longname', 'unavailable'))
) WITHOUT ROWID;
