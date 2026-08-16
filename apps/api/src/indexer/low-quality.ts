import { setState } from "./state";

/**
 * Low-quality asset list, mirrored from xcp.io.
 *
 * Our own rule (migration 0032, stats.ts) hides a market when >=50% of its trades have the same
 * address on both sides. It catches self-fills and nothing else — a ring of addresses passing an
 * asset between themselves produces no self-filled match at all, and that is how SCUDOCOIN (2.2%
 * self-trade), MPTSTOCK (0%) and RRAM (3.7%) reached the top ten of /explore/assets and the
 * homepage top-traded with "Hide low quality" on.
 *
 * xcp.io's asset_signals.low_quality is the union of our self-trade rule, a curated deny list that
 * ring-trade review feeds, and issuer contagion. The last two need signals we do not index, so this
 * mirrors the answer instead of re-deriving it. See migration 0036 for the seed and the rationale.
 */
const LOW_QUALITY_TAG_URL = "https://api.xcp.io/v2/tags/low_quality";
/** Server caps the page; 100 is what it serves. */
const PAGE_SIZE = 100;
/** A runaway `next_offset` would otherwise loop forever against a paid API. */
const MAX_PAGES = 50;
/** Max rows per INSERT statement (1 param each, well inside D1's 100-bound-param limit) */
const ROWS_PER_STMT = 90;

interface TagMember {
  asset: string;
}

interface TagPage {
  result?: { members?: TagMember[] };
  next_offset?: number | null;
}

/** Fetch every page of the low_quality tag. Returns asset names, deduplicated. */
async function fetchLowQualityAssets(): Promise<string[]> {
  const assets = new Set<string>();
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${LOW_QUALITY_TAG_URL}?limit=${PAGE_SIZE}&offset=${offset}`, {
      headers: { "User-Agent": "xcpdex-indexer", accept: "application/json" },
    });
    if (!res.ok) throw new Error(`xcp.io low_quality fetch error: ${res.status} at offset ${offset}`);
    const body: TagPage = await res.json();

    const members = body.result?.members ?? [];
    for (const m of members) {
      if (m.asset) assets.add(m.asset.toUpperCase());
    }

    // next_offset is null on the last page; an empty page ends it too, in case that changes.
    if (members.length === 0 || body.next_offset == null) break;
    offset = body.next_offset;
  }

  return [...assets];
}

/**
 * Refresh low_quality_assets from xcp.io and propagate to the hidden flags the read routes filter on.
 *
 * Propagation only ever sets hidden = 1, the same invariant stats.ts keeps: an asset falling off
 * xcp.io's list does not un-hide its markets, because self_trade_pct is an all-time ratio that a
 * washed market never sheds, and because an upstream blip should not resurface a wash market on the
 * homepage. Un-hiding stays a deliberate manual UPDATE.
 */
export async function syncLowQualityAssets(
  db: D1Database
): Promise<{ assets: number; pairs_hidden: number; dispensers_hidden: number }> {
  const assets = await fetchLowQualityAssets();
  // An empty response is upstream failing, not every asset becoming clean. Leave the table alone.
  if (assets.length === 0) throw new Error("xcp.io low_quality returned no assets");

  const now = Math.floor(Date.now() / 1000);

  // Upsert rather than replace: the table is the propagation source, and truncating it mid-sync
  // would leave the hidden flags briefly unexplainable. Stale rows are harmless — hiding is additive.
  for (let i = 0; i < assets.length; i += ROWS_PER_STMT) {
    const chunk = assets.slice(i, i + ROWS_PER_STMT);
    await db
      .prepare(
        `INSERT INTO low_quality_assets (asset, synced_at) VALUES ${chunk.map(() => "(?, " + now + ")").join(", ")}
         ON CONFLICT (asset) DO UPDATE SET synced_at = excluded.synced_at`
      )
      .bind(...chunk)
      .run();
  }

  // Both legs — a market priced IN a manipulated asset reports a manipulated price. Mirrors xcp.io,
  // which flags a trade when either side of it is low quality.
  const [pairs, dispensers] = await db.batch<unknown>([
    db.prepare(
      `UPDATE pair_stats SET hidden = 1
       WHERE hidden = 0
         AND (base_asset  IN (SELECT asset FROM low_quality_assets)
           OR quote_asset IN (SELECT asset FROM low_quality_assets))`
    ),
    db.prepare(
      `UPDATE dispenser_stats SET hidden = 1
       WHERE hidden = 0
         AND asset IN (SELECT asset FROM low_quality_assets)`
    ),
  ]);

  await setState(db, "last_low_quality_sync", String(now));

  const pairsHidden = pairs.meta.changes ?? 0;
  const dispensersHidden = dispensers.meta.changes ?? 0;
  if (pairsHidden > 0 || dispensersHidden > 0) {
    console.log(
      `low-quality sync: ${assets.length} assets, hid ${pairsHidden} pairs, ${dispensersHidden} dispenser rows`
    );
  }

  return { assets: assets.length, pairs_hidden: pairsHidden, dispensers_hidden: dispensersHidden };
}
