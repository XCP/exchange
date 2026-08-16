import type { Metadata } from 'next'

/**
 * Pretty deep links for the form surfaces, without minting a page per pair.
 *
 * `/swap`, `/swap/XCP`, `/swap/XCP/PEPECASH` are all the SAME page with the
 * form pre-filled differently — there is no unique content on the deeper
 * ones, only a different default. Two assets over a few thousand tradeable
 * ones is a combinatorial number of URLs, so left alone a crawler would
 * happily discover an unbounded set of near-identical pages and dilute the
 * one that matters.
 *
 * So every parameterized variant declares the bare route as its canonical.
 * That is the tool built for "same page, different parameters": it keeps the
 * link shareable and crawlable while consolidating all ranking signals onto
 * one URL.
 *
 * Deliberately NOT paired with `noindex`. Google's own guidance is that the
 * two are contradictory — a canonical says "index the other one", noindex
 * says "index nothing" — and when a crawler picks the canonical it can carry
 * the noindex across the cluster and drop the base page too. Canonical alone
 * achieves what we want here.
 */

/** The asset shapes routes accept — plain names, and dotted subasset longnames. */
const ASSET_PATTERN = /^[A-Za-z0-9._@!-]{1,64}$/

/**
 * Clean a URL segment into something worth looking up.
 *
 * Case is the subtlety. A plain Counterparty asset name is always uppercase
 * A-Z, so upcasing it is safe and makes /swap/pepecash work. A SUBASSET
 * longname is not: `SOUNDGARDEN.Black_Hole_Sun` is a real mainnet asset, and
 * upcasing it produces a name that is merely resolvable — the API is
 * forgiving on lookup — while being wrong to display or link. So anything
 * containing a dot keeps the case it arrived with, and the exact spelling is
 * settled by resolveAsset against the chain.
 */
export function normalizeAsset(segment: string | undefined): string | null {
  if (!segment) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return null
  }
  const cleaned = decoded.includes('.') ? decoded : decoded.toUpperCase()
  return ASSET_PATTERN.test(cleaned) ? cleaned : null
}

/**
 * A give/get pair from the URL. One segment names the asset of interest and
 * leaves the direction at its default; two name both legs explicitly, so
 * `/swap/XCP/PEPECASH` and `/swap/PEPECASH/XCP` are opposite directions of
 * the same market.
 */
export interface PairRoute {
  first: string | null
  second: string | null
}

export function parsePairSegments(segments: string[] | undefined): PairRoute {
  const [a, b] = segments ?? []
  return { first: normalizeAsset(a), second: normalizeAsset(b) }
}

/**
 * An asset as the site needs it in three places at once.
 *
 * A subasset has two names for the same thing: the protocol name
 * (`A16805049243970262805`) and the longname (`SOUNDGARDEN.Black_Hole_Sun`).
 * They are not interchangeable — the DEX API keys pair slugs on the protocol
 * name, while the longname is the one a human recognises — so both travel
 * together rather than one being reconstructed from the other.
 */
export interface ResolvedAsset {
  /** Protocol name. What internal APIs and pair slugs are keyed on. */
  name: string
  /** Longname when there is one — what URLs and labels should say. */
  canonical: string
  longname: string | null
  divisible: boolean
}

/** Always present, never subassets — resolving these over the wire is waste. */
const WELL_KNOWN: Record<string, ResolvedAsset> = {
  XCP: { name: 'XCP', canonical: 'XCP', longname: null, divisible: true },
  BTC: { name: 'BTC', canonical: 'BTC', longname: null, divisible: true },
}

/**
 * Settle a URL segment against the chain.
 *
 * Returns null when no such asset exists, which callers turn into a 404 —
 * a typo in an asset name should say so rather than rendering an empty form
 * that looks broken.
 */
export async function resolveAsset(
  segment: string | null,
  lookup: (asset: string) => Promise<{ asset: string; asset_longname: string | null; divisible: boolean } | null>,
): Promise<ResolvedAsset | null> {
  if (!segment) return null
  const wellKnown = WELL_KNOWN[segment.toUpperCase()]
  if (wellKnown) return wellKnown

  const info = await lookup(segment)
  if (!info) return null
  return {
    name: info.asset,
    canonical: info.asset_longname ?? info.asset,
    longname: info.asset_longname,
    divisible: info.divisible,
  }
}

/**
 * Point the address bar at a pair without re-running the route.
 *
 * `router.replace()` looks right for this and is wrong: changing a dynamic
 * segment re-renders it and REMOUNTS the client component, wiping every
 * piece of local state the form holds. Verified by typing an amount and
 * flipping — the amount was gone, and so was the flip button's rotation.
 *
 * Nothing on these pages needs the server when a leg changes. The params
 * seed the form on first load and after that the client owns the truth, so
 * the URL is a bookmark being kept in step rather than a data source. The
 * native History API is what updates a bookmark; Next.js supports it for
 * exactly this case.
 *
 * The trade-off is that `generateMetadata` doesn't re-run, so the tab title
 * keeps whatever the pair was on load. A stale title costs less than losing
 * what someone typed, and a shared or reloaded URL still renders correctly
 * because the params are still authoritative on entry.
 */
export function replacePairPath(path: string) {
  if (typeof window !== 'undefined') window.history.replaceState(null, '', path)
}

/** Build the path for a pair, omitting segments that carry no information. */
export function pairPath(base: string, first?: string | null, second?: string | null): string {
  const parts = [first, second].filter(Boolean) as string[]
  return parts.length === 0 ? base : `${base}/${parts.map(encodeURIComponent).join('/')}`
}

/**
 * The asset a dispense route assumes when the URL names none.
 *
 * XCP is the overwhelming majority of dispenser activity and the one asset
 * safe to assume, the way it is on /swap and /limit.
 */
export const DISPENSE_DEFAULT_ASSET = 'XCP'

/**
 * Drop a segment that only restates the route's own default.
 *
 * `/buy/XCP` and `/buy` are the same page — the segment adds nothing but a
 * second URL for one thing, which splits links and ranking signals between
 * them. Every surface with a default leg uses this so the shortest spelling
 * is the only one, and the longer form redirects to it rather than
 * co-existing with it.
 */
export function omitDefault(value: string | null | undefined, defaultValue: string): string | null {
  return !value || value === defaultValue ? null : value
}

/**
 * Metadata for one of these routes.
 *
 * The title still names the assets — a shared link should say what it opens,
 * and that text is what a chat client or a browser tab shows. Only the
 * canonical is pinned to the bare route.
 */
export function buildFormMetadata({
  base,
  title,
  first,
  second,
}: {
  /** The bare route, e.g. '/swap' — always the canonical. */
  base: string
  title: string
  first?: string | null
  second?: string | null
}): Metadata {
  const suffix = [first, second].filter(Boolean).join(' → ')
  const fullTitle = suffix ? `${title} ${suffix}` : title
  /**
   * No description, deliberately.
   *
   * These four are tools, not documents. The title already says what the page
   * does and which pair it is pointed at, and every description they carried
   * explained the CONCEPT — "Market-swap Counterparty assets against pools and
   * the order book" — which is of no use to someone who was just handed the
   * link and can see the form. A share card with a strong title and no
   * subtitle reads better than one padded with a definition.
   */
  return {
    // `null`, not omitted. Leaving the field out lets Next inherit the root
    // layout's site-wide sentence, which is the generic prose this was meant
    // to drop — the page ends up with a description either way unless it says
    // so explicitly.
    title: fullTitle,
    description: null,
    alternates: { canonical: base },
    // Only the top-level field accepts null; the og/twitter objects simply
    // omit it, and having no description there is the same outcome.
    openGraph: { title: fullTitle, url: base },
    twitter: { card: 'summary', title: fullTitle },
  }
}
