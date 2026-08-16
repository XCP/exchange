import { big, num } from '@/utils/numeric'

/**
 * The depth curve of a Counterparty liquidity pool.
 *
 * A pool has no order book to read depth from, and doesn't need one: the
 * reserves fully determine what any trade would cost. Depth here is derived
 * rather than observed, so it is exact rather than a sample of recent fills.
 *
 * The curve is FEE-INCLUSIVE, and mirrors what core actually does. Both the
 * invariant and the fee handling were confirmed against
 * `lib/ledger/markets.py` and against the live quote endpoint, which agreed to
 * the satoshi at four sizes spanning four orders of magnitude:
 *
 *   - constant product, fee taken on the INPUT
 *   - `XCP_POOL_FEE_BPS = 50` when either leg is XCP, `OTHER_POOL_FEE_BPS = 100`
 *
 * An earlier version used the fee-free identity `x(P) = √(k/P)`. That answers
 * "how is liquidity distributed", which is a fair question — but this chart
 * labels its readout "sell N to move price to P", which is a promise about a
 * real trade. A trader pays the fee, so a figure that omits it is simply the
 * wrong number for the sentence it sits next to.
 *
 * Two conventions from core's `try_pool_fill` that are easy to get backwards:
 *
 *   1. `reserve_in`/`reserve_out` follow the TAKER's direction, not the pool's
 *      asset_a/asset_b order.
 *   2. the target price is INPUT PER OUTPUT — what the taker pays per unit
 *      received. So SELLING base targets a base-per-quote rate (the
 *      reciprocal of the chart's price) and BUYING base targets quote-per-base
 *      (the price directly). Reading this backwards is not a subtle error: it
 *      returns zero size on one side and nearly the whole reserve on the
 *      other, which is how it was caught.
 *
 * The result is in units of the INPUT asset, which differs per side. Both are
 * converted to base units so the two halves share a y-axis, the way an order
 * book's depth chart does.
 *
 * RESTING ORDERS COUNT TOO. A fill on Counterparty routes across both venues —
 * `try_pool_fill` runs alongside order matching — so the liquidity available
 * at a price is the pool's plus every order already priced at or better than
 * it. Measured on PEPECASH/XCP, the book supplied up to 12.6% of a fill at
 * sizes inside this chart's range, so a pool-only curve understates depth
 * exactly where it claims to inform.
 *
 * The two ADD rather than interleave. Interleaving decides the ORDER a router
 * consumes them in; this chart asks what TOTAL is obtainable without paying
 * worse than a given price, and pool and book are separate sources of the same
 * asset. The visible effect is a step wherever an order sits, on an otherwise
 * smooth curve.
 */

/** One side of the resting book, in base units at a quote-per-base price. */
export interface BookLevel {
  price: number
  amount: number
}

export interface DepthBook {
  /** Buyers of the base asset — they absorb what you SELL. */
  bids: BookLevel[]
  /** Sellers of the base asset — they supply what you BUY. */
  asks: BookLevel[]
}
export interface DepthPoint {
  /** Price of the base asset in quote terms. */
  price: number
  /** Cumulative base-asset size needed to move the pool to this price. */
  size: number
  side: 'buy' | 'sell'
}

/** How far either side of the current price the curve is drawn. */
const SPAN = 0.5
const STEPS = 40
const BPS = 10000

/**
 * Core's `compute_pool_output`, in decimal rather than integer form.
 *
 * Chart resolution, not consensus: core floors to whole base units and this
 * doesn't, which is invisible at forty sample points across a curve.
 */
function poolOutput(reserveIn: number, reserveOut: number, input: number, feeBps: number): number {
  if (input <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0
  const withFee = big(input).times(BPS - feeBps)
  return num(withFee.times(reserveOut).dividedBy(big(reserveIn).times(BPS).plus(withFee)))
}

/**
 * Core's `compute_pool_input_for_target_price` — the max input before the
 * pool's marginal price reaches `targetPrice`, expressed as INPUT PER OUTPUT.
 *
 * This is the quadratic core solves. It also carries an integer variant behind
 * the `fix_pool_best_price_routing` protocol flag, which differs only in
 * rounding; for a curve at this resolution the closed form is the same shape.
 */
function inputForTargetPrice(
  reserveIn: number,
  reserveOut: number,
  targetPrice: number,
  feeBps: number,
): number {
  if (reserveIn <= 0 || reserveOut <= 0 || targetPrice <= 0) return 0

  const feeFactor = BPS - feeBps
  // Already past the target — the pool's marginal rate is worse than asked.
  if (reserveIn * BPS >= reserveOut * feeFactor * targetPrice) return 0

  const a = big(feeFactor)
  const b = big(reserveIn).times(BPS + feeFactor)
  const cTarget = big(reserveIn).times(reserveOut).times(feeFactor).times(targetPrice)
  const constant = big(reserveIn).times(reserveIn).times(BPS).minus(cTarget)

  const discriminant = b.times(b).minus(a.times(constant).times(4))
  if (discriminant.isLessThan(0)) return 0

  const dx = discriminant.sqrt().minus(b).dividedBy(a.times(2))
  return dx.isGreaterThan(0) ? num(dx) : 0
}

export function buildDepthCurve(
  reserveBase: number,
  reserveQuote: number,
  feeBps: number,
  book?: DepthBook,
): DepthPoint[] {
  if (!(reserveBase > 0) || !(reserveQuote > 0)) return []

  const spot = reserveQuote / reserveBase
  const points: DepthPoint[] = []

  // Buying, every ask priced at or below the target is obtainable; selling,
  // every bid at or above it will take your size.
  const asksUpTo = (price: number) =>
    (book?.asks ?? []).reduce((sum, o) => (o.price <= price ? sum + o.amount : sum), 0)
  const bidsDownTo = (price: number) =>
    (book?.bids ?? []).reduce((sum, o) => (o.price >= price ? sum + o.amount : sum), 0)

  // From 0 so both sides include the zero-size point at spot; without it the
  // two curves stop short of each other around the very price they describe.
  for (let i = 0; i <= STEPS; i++) {
    const frac = (SPAN * i) / STEPS

    // Buying base pushes its price UP.
    const upPrice = spot * (1 + frac)
    // Giving quote to get base, so the rate paid is quote-per-base: the
    // chart's price as-is.
    const quoteIn = inputForTargetPrice(reserveQuote, reserveBase, upPrice, feeBps)
    points.push({
      price: upPrice,
      // Converted to base so both halves share one y-axis.
      size: poolOutput(reserveQuote, reserveBase, quoteIn, feeBps) + asksUpTo(upPrice),
      side: 'buy',
    })

    // Selling base pushes its price DOWN. The result is already in base
    // units, since base is what the taker hands over.
    const downPrice = spot * (1 - frac)
    points.push({
      price: downPrice,
      // Giving base to get quote, so the rate paid is base-per-quote: the
      // reciprocal of the chart's price.
      size:
        inputForTargetPrice(reserveBase, reserveQuote, 1 / downPrice, feeBps) +
        bidsDownTo(downPrice),
      side: 'sell',
    })
  }

  return points.sort((a, b) => a.price - b.price)
}

/** The pool's current price, in quote per base. */
export function spotPrice(reserveBase: number, reserveQuote: number): number {
  return reserveBase > 0 ? reserveQuote / reserveBase : 0
}
