import { num } from '@/utils/numeric'

/**
 * What KIND of thing an asset is, so the page can stop treating a 1-of-1 card
 * and a currency as the same object.
 *
 * Every kind here is a fact about the asset's FORM, not about how much it has
 * traded. That is a deliberate correction. The previous ladder ended in
 * `token` (3+ trades) and `thin` (fewer), which meant the column answered two
 * unrelated questions at once and the answer to the second one was already in
 * the Trades column beside it. Worse, it made `token` an activity bucket
 * wearing a form name: MEGACORN is indivisible with a supply in the tens of
 * thousands and was labelled a Token purely for having traded.
 *
 * Measured against production (22,493 assets): 92% of Counterparty is
 * indivisible, so a single Collectible kind covered 89% of the network and
 * filtered almost nothing. Splitting on supply is what makes it useful — a
 * 1-of-1 and a run of 300 are different things to want.
 *
 * `currency` is the one ROLE in the list and it outranks form, because being
 * what other markets are priced in is the more important fact about an asset
 * that is both. XCP is divisible and would otherwise read as a Token.
 */
export type AssetKind = 'currency' | 'token' | 'edition' | 'one_of_one'

export interface AssetProfile {
  kind: AssetKind
  /** Used as the quote side by other markets — it functions as money. */
  isCurrency: boolean
  /** Indivisible — an item or a run of them, not a balance. */
  isCollectible: boolean
  /** Has at least one market that PRICES it (it is the base). */
  isPriced: boolean
  hasDispensers: boolean
}

/** Quoting this many markets means other things are priced IN it. */
const CURRENCY_MIN_QUOTE_PAIRS = 10

export function classifyAsset({
  supply,
  divisible,
  quotePairCount,
  pricedMarketCount,
  hasDispensers,
}: {
  supply: number | string | null | undefined
  divisible: boolean | undefined
  /** How many markets use this asset as their quote. */
  quotePairCount: number
  /** How many markets price this asset (it is the base). */
  pricedMarketCount: number
  hasDispensers: boolean
}): AssetProfile {
  const supplyNum = num(supply)
  const isCurrency = quotePairCount >= CURRENCY_MIN_QUOTE_PAIRS
  const isCollectible = divisible === false

  /**
   * Role, then form, then how many of it there are.
   *
   * A supply of exactly 1 is the only thing that makes a 1-of-1; everything
   * else indivisible is an edition, including the handful whose supply has
   * been destroyed down to zero. Calling those 1-of-1s would be worse — there
   * is not one of them, there are none.
   */
  const kind: AssetKind = isCurrency
    ? 'currency'
    : divisible !== false
      ? 'token'
      : supplyNum === 1
        ? 'one_of_one'
        : 'edition'

  return {
    kind,
    isCurrency,
    isCollectible,
    isPriced: pricedMarketCount > 0,
    hasDispensers,
  }
}

/** Short human label for the header badge. */
export const KIND_LABEL: Record<AssetKind, string> = {
  currency: 'Currency',
  token: 'Token',
  edition: 'Edition',
  one_of_one: '1-of-1',
}

/** What each label claims, for the filter's tooltip. */
export const KIND_HINT: Record<AssetKind, string> = {
  currency: 'Other markets are priced in it',
  token: 'Divisible — a balance, not an item',
  edition: 'Indivisible, issued as a run',
  one_of_one: 'Indivisible, supply of one',
}
