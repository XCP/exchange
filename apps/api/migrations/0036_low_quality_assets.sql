-- Low-quality assets, synced from xcp.io.
--
-- Migration 0032 populated pair_stats.hidden from ONE rule: >=50% self-trades over >=30 trades.
-- That rule only catches an address filling its own order. It cannot see a ring — a closed set of
-- addresses passing an asset back and forth — because no single match has the same address on both
-- sides. SCUDOCOIN self-trades 2.2%, MPTSTOCK 0%, RRAM 3.7%, and all three sat in the top 10 of
-- /explore/assets and the homepage top-traded with "Hide low quality" ON.
--
-- xcp.io already flags these. Its asset_signals.low_quality is the union of three arms: the same
-- self-trade rule we implement, a human-curated deny list fed by ring-trade review (queries/trades.ts
-- ringCandidates: DIAMONDBOND 97% reciprocal, RRAM 81%, SCUDOCOIN 67% against PEPECASH 6%, XCP 0%),
-- and issuer contagion (an issuer with >=4 flagged assets and >=50% of their assets flagged). Only
-- the first arm is reproducible from our own tables, so we mirror the result rather than the rule.
-- The list is public at https://api.xcp.io/v2/tags/low_quality; indexer/low-quality.ts re-syncs it
-- daily, and this seed is the snapshot at time of writing (128 assets) so the fix lands with the
-- migration instead of on the next cron tick.
--
-- Hiding follows migration 0032's invariant: this only ever sets hidden = 1. An asset dropping off
-- xcp.io's list does not un-hide its markets automatically — un-hiding is a deliberate manual
-- operation, so an upstream blip cannot resurface a wash market on the homepage.
CREATE TABLE low_quality_assets (
  asset     TEXT PRIMARY KEY,
  synced_at INTEGER NOT NULL DEFAULT 0
);

INSERT INTO low_quality_assets (asset) VALUES
  ('A11615174341463985444'), ('A11937086693504660464'), ('A11984891106868617664'), ('A13273226806846313258'),
  ('A13401453567681343017'), ('A13718630567303913485'), ('A13836077288900301480'), ('A14074648224959053374'),
  ('A14469851304736324220'), ('A14618994776968223028'), ('A14680129079612289208'), ('A14976207886959944153'),
  ('A15904926322556665176'), ('A15975635184435560825'), ('A16346978662327733062'), ('A16633791645021321509'),
  ('A16687213502218630005'), ('A16858584072258745160'), ('A1703096385656018568'), ('A2161830940746832633'),
  ('A2316484969541548456'), ('A2384426809477115589'), ('A2469461120942094309'), ('A2769433465776768864'),
  ('A2785239638969352676'), ('A2848268701430318990'), ('A3326380657626120663'), ('A4219293356469046725'),
  ('A4391853287542981791'), ('A4481830052467199729'), ('A4715335211141222360'), ('A5557021997076742535'),
  ('A6545283291136814819'), ('A6751780836742338355'), ('A7653053619000933582'), ('A7771332604329827915'),
  ('A7938028808513940641'), ('A8047217738987158708'), ('A8857415869833437486'), ('A9002421369308948443'),
  ('A9170398405421512794'), ('A921933274660182119'), ('BARAK'), ('BARXCP'),
  ('BITMONETA'), ('BNSXCP'), ('BONUSBTC'), ('COUNTEREVENT'),
  ('CRYPTONAIRA'), ('DIAMONDBOND'), ('DIKKE'), ('DOLLARCASH'),
  ('DUNNECAP'), ('EARNFREEBTC'), ('ERDE'), ('FACEBOOKS'),
  ('FASHAWNS'), ('FRIGG'), ('FUHCOIN'), ('FUUUUUH'),
  ('GALGO'), ('GOLDTRANSACT'), ('GORILA'), ('GPSHARES'),
  ('GTPSHARES'), ('GUANII'), ('HANJ'), ('HLTH'),
  ('HOMMALICOIN'), ('ILOVE'), ('KAWAZUXYZ'), ('KIZNA'),
  ('KVELL'), ('LUUSH'), ('MACROSS'), ('MAIDSAFE'),
  ('MEAT'), ('METISS'), ('MINDOL'), ('MONKEYBUCKS'),
  ('MPBTC'), ('MPTSTOCK'), ('MUUI'), ('MYBLT'),
  ('NAGEZENI'), ('NAJBEZ'), ('NARUCHAN'), ('NILI'),
  ('NNTOKEN'), ('NVST'), ('NVSTVOTING'), ('NVSX'),
  ('OGPASS'), ('ORDIPEPE'), ('OXBT'), ('PANDAGOLD'),
  ('PERFECTCERTS'), ('PIENA'), ('PLATONCOIN'), ('PROTEIOS'),
  ('RAISERCC'), ('RAIZER'), ('RCANA'), ('RESORTLIFE'),
  ('RIAM'), ('RRAM'), ('SCUDOCOIN'), ('SKER'),
  ('SONN'), ('SOVEREIGNC'), ('TAIIL'), ('TAIZEN'),
  ('TAOCOIN'), ('TASX'), ('TETLAS'), ('THRIFTCARD'),
  ('TROPTIONS'), ('TROPTIONSBC'), ('TROPTIONSPAY'), ('TRZO'),
  ('VACUS'), ('VACUSXRP'), ('WAIK'), ('WAKUMO'),
  ('WALLST'), ('WOOOOK'), ('XTROPTIONS'), ('YMST')
;

-- Both legs, matching xcp.io's rule (queries/trades.ts QUALITY flags a trade when EITHER side is
-- low quality). A market priced IN a manipulated asset reports a manipulated price, so the quote
-- side counts: in the top 500 markets by all-time volume, 46 have a flagged base and 41 a flagged
-- quote (VACUS, TROPTIONS, FUUUUUH and the other issuer families quoting their own tokens).
UPDATE pair_stats SET hidden = 1
  WHERE hidden = 0
    AND (base_asset  IN (SELECT asset FROM low_quality_assets)
      OR quote_asset IN (SELECT asset FROM low_quality_assets));

-- Dispensers are a separate venue with its own flag, hand-set for three assets back in migration
-- 0005 (OXBT, ORDIPEPE, OGPASS — all three are on xcp.io's list too).
UPDATE dispenser_stats SET hidden = 1
  WHERE hidden = 0
    AND asset IN (SELECT asset FROM low_quality_assets);
