import { QUOTE_ASSETS } from '@/utils/constants'

/**
 * Which of two assets is the base and which is the quote.
 *
 * The DEX stores one directional slug per market — `PEPECASH_XCP` has data
 * and `XCP_PEPECASH` returns an empty grid — so anything asking for a market
 * by two asset names has to agree with the indexer about the order.
 *
 * The standard is `getTradingPair` in the extension
 * (extension/src/core/tradingPair.ts), which has the reference list and its
 * own tests. Our QUOTE_ASSETS is byte-identical to the extension's, and this
 * follows the same branch order and the same `localeCompare` tiebreak.
 *
 * The API's `determineBaseQuote` (apps/api/src/lib/pairs.ts) is what writes
 * the rows, and all three implementations are now reconciled: identical
 * 57-entry lists and the same `localeCompare` tiebreak, verified by comparing
 * the three sources directly.
 *
 * They drifted once before — the API was missing `BOBOXX` and tiebroke with
 * `<`, which disagrees with collation on names containing an underscore. Both
 * were still latent when found (the only two BOBOXX markets resolved the same
 * way through the alphabetical fallback, and no indexed pair contained an
 * underscore), so reconciling needed no reindex. That will not be true of the
 * next divergence, which is the reason to keep the three in step.
 *
 * Note the ordering convention flips between the files: the API's list runs
 * low-to-high priority, the extension's and ours run high-to-low, so a LOWER
 * index here means a stronger claim to being the quote.
 */
const QUOTE_KEYWORDS = ['CASH', 'COIN', 'MONEY', 'BTC']

const isQuoteByKeyword = (symbol: string) =>
  QUOTE_KEYWORDS.some((kw) => symbol.toUpperCase().includes(kw))

export function determineBaseQuote(a: string, b: string): { base: string; quote: string } {
  const rankA = QUOTE_ASSETS.indexOf(a)
  const rankB = QUOTE_ASSETS.indexOf(b)

  // Both listed: the stronger claim (lower index) becomes the quote.
  if (rankA >= 0 && rankB >= 0) {
    return rankA < rankB ? { base: b, quote: a } : { base: a, quote: b }
  }
  // Only one listed: that one is the quote.
  if (rankA >= 0) return { base: b, quote: a }
  if (rankB >= 0) return { base: a, quote: b }

  const kwA = isQuoteByKeyword(a)
  const kwB = isQuoteByKeyword(b)
  if (kwA && !kwB) return { base: b, quote: a }
  if (kwB && !kwA) return { base: a, quote: b }

  // Both or neither look like a quote — alphabetical, lower sorts as base.
  // localeCompare rather than `<`, matching the extension: see the note above
  // on why the two disagree for names containing an underscore.
  return a.localeCompare(b) < 0 ? { base: a, quote: b } : { base: b, quote: a }
}

/** The slug the OHLC and market endpoints are keyed on. */
export function marketPairSlug(a: string | null, b: string | null): string | null {
  if (!a || !b || a === b) return null
  const { base, quote } = determineBaseQuote(a, b)
  return `${base}_${quote}`
}

/**
 * Split a pair the way the indexer wrote it.
 *
 * The separator is the LAST one, not the first: a base asset name may itself
 * contain an underscore, so `A_B_XCP` is base `A_B` quoted in `XCP`. Accepts
 * either spelling because the API returns `BASE/QUOTE` and URLs carry
 * `BASE_QUOTE`.
 */
export function splitPair(pair: string): { base: string; quote: string } | null {
  const cut = Math.max(pair.lastIndexOf('/'), pair.lastIndexOf('_'))
  if (cut < 1 || cut === pair.length - 1) return null
  return { base: pair.slice(0, cut), quote: pair.slice(cut + 1) }
}

/**
 * Where a market link goes.
 *
 * There is no market ANALYTICS page any more — `/trade/BASE_QUOTE` tried to
 * be one and was four half-copies of pages that already existed. A market is
 * now a thing you act on (`/swap/BASE/QUOTE`, which carries the chart) and an
 * asset is the thing you read about (`/BASE`). This is the single place that
 * decides, so the answer can change once rather than in a dozen tables.
 *
 * Falls back to the asset page when the pair is unsplittable — a link to
 * something real beats a link to a 404.
 */
export function marketPath(pair: string): string {
  return formPath('/swap', pair)
}

/**
 * The same market on a chosen form. Meeting a specific resting order is a
 * limit action — swap has nowhere to put the price that was clicked — so
 * that caller asks for `/limit` explicitly rather than rewriting a swap URL.
 */
export function formPath(form: '/swap' | '/limit' | '/buy' | '/sell', pair: string): string {
  const parts = splitPair(pair)
  if (!parts) return `/${encodeURIComponent(pair)}`
  return `${form}/${encodeURIComponent(parts.base)}/${encodeURIComponent(parts.quote)}`
}
