/**
 * What a Counterparty pool charges on a swap, and therefore what its
 * liquidity providers earn.
 *
 * Consensus sets this by composition, not by choice: a pool with an XCP leg
 * takes 50 bps and every other pair takes 100. There is no fee tier to pick
 * the way there is on Uniswap — naming the two assets has already decided it.
 *
 * Written out in three places before this (the pools browse table, the pool
 * detail page and the depth curve), which is three chances for a consensus
 * rule to drift. The swap form is the exception and stays as it is: it reads
 * `fee_bps` off the quote, which is the API stating what it actually charged
 * rather than the client re-deriving it.
 */

export const XCP_POOL_FEE_BPS = 50
export const OTHER_POOL_FEE_BPS = 100

export function poolFeeBps(assetA: string, assetB: string): number {
  return assetA === 'XCP' || assetB === 'XCP' ? XCP_POOL_FEE_BPS : OTHER_POOL_FEE_BPS
}

/** "0.5%" / "1%" — trailing zeros trimmed, since 1.0% reads as false precision. */
export function poolFeeLabel(assetA: string, assetB: string): string {
  const bps = poolFeeBps(assetA, assetB)
  return `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(1)}%`
}
