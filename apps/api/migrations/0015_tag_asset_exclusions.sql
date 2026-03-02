-- Exclusions survive tag re-syncs: after each sync, matching rows are deleted from tag_assets.
-- (tag_slug, asset) rather than tag_id so exclusions are readable and portable.
CREATE TABLE IF NOT EXISTS tag_asset_exclusions (
  tag_slug TEXT NOT NULL,
  asset TEXT NOT NULL,
  PRIMARY KEY (tag_slug, asset)
);

-- Seed: remove duplicate collection memberships (keep the more specific/primary collection)
INSERT INTO tag_asset_exclusions (tag_slug, asset) VALUES
  -- sarutobi-island assets that belong in spells-of-genesis
  ('sarutobi-island', 'SATOSHICARD'),
  ('sarutobi-island', 'SARUTOBICARD'),
  ('sarutobi-island', 'CNPCARD'),
  -- memorychain asset that belongs in sarutobi-island
  ('memorychain', 'SARUTOBIISL'),
  -- PEPEACIDTRIP belongs in rare-pepe, not dank-directory
  ('dank-directory', 'PEPEACIDTRIP'),
  -- All dank-directory + rare-bobo overlaps: keep in rare-bobo
  ('dank-directory', 'A14090755373088008502'),
  ('dank-directory', 'BOBKACHU'),
  ('dank-directory', 'BOBLO'),
  ('dank-directory', 'BOBOCASH'),
  ('dank-directory', 'BOBOCIRCLE'),
  ('dank-directory', 'BOBODICAPRIO'),
  ('dank-directory', 'BOBODON'),
  ('dank-directory', 'BOBOKAREN'),
  ('dank-directory', 'BOBOMFER'),
  ('dank-directory', 'BOBONOPOULOS'),
  ('dank-directory', 'BOBOPIZZA'),
  ('dank-directory', 'BOBOROSS'),
  ('dank-directory', 'BOBOSWEEP'),
  ('dank-directory', 'BOBOWETRUST'),
  ('dank-directory', 'BOBOWHALE'),
  ('dank-directory', 'CLUBBOBO'),
  ('dank-directory', 'CONTRABOBO'),
  ('dank-directory', 'DANKEQDANK'),
  ('dank-directory', 'DEVBOBO'),
  ('dank-directory', 'FAKEBOBOCASH'),
  ('dank-directory', 'GOXBOBO'),
  ('dank-directory', 'GRIMBOBO'),
  ('dank-directory', 'INVISIBOBO'),
  ('dank-directory', 'LAMBOBO'),
  ('dank-directory', 'LUCKYBOBO'),
  ('dank-directory', 'MAGICBOBO'),
  ('dank-directory', 'MONABOBO'),
  ('dank-directory', 'MYBIGBOBO'),
  ('dank-directory', 'NAKABOTO'),
  ('dank-directory', 'NINJABOBO'),
  ('dank-directory', 'ONLYONEBOBO'),
  ('dank-directory', 'PEPEPOVERTY'),
  ('dank-directory', 'RAREBOBO'),
  ('dank-directory', 'RICHBOBO'),
  ('dank-directory', 'SAMBOBOMAN'),
  ('dank-directory', 'SHITCOINBOBO'),
  ('dank-directory', 'STRONGBOBO'),
  ('dank-directory', 'THEBOBO'),
  ('dank-directory', 'TORROBOBO'),
  ('dank-directory', 'UFOBOBO'),
  -- dank-directory asset that belongs in stamps
  ('dank-directory', 'A3836575546271978500'),
  -- rare-bobo asset that belongs in stamps
  ('rare-bobo', 'A808011111111111111');
