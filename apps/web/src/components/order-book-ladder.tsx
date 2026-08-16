'use client'

import type { OrderBookEntry } from '@/types/trading'
import { big, num, ROUND_DOWN } from '@/utils/numeric'

/** Rows per side. Matches DispenserList so the two asides read the same. */
const ROWS = 8

/**
 * The resting book beside the limit form.
 *
 * /buy and /sell have had an aside since they were built — the dispenser
 * ladder — and /limit did not, which made it the only trading surface where
 * you had to already know the market to price an order. The form's best
 * bid/ask shortcuts were doing that job through a keyhole.
 *
 * Conventional orientation, deliberately: asks above, bids below, spread
 * between them, best of each meeting in the middle. Anyone who has used an
 * exchange reads this without being taught, and inventing a nicer arrangement
 * would cost exactly the people most likely to use it.
 *
 * Prices are clickable and fill the form. Unlike the dispenser buy ladder —
 * where a click would imply a routing choice the form does not offer — a limit
 * price IS the thing being chosen, so pointing at a level in the book is the
 * most direct way to say "here".
 */
export function OrderBookLadder({
  bids,
  asks,
  spread,
  spreadPct,
  isLoading,
  quoteLabel,
  onPickPrice,
}: {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread: string
  spreadPct: string
  isLoading: boolean
  quoteLabel: string
  onPickPrice?: (price: string) => void
}) {
  /**
   * Asks are reversed so the CHEAPEST ask sits at the bottom of its block,
   * touching the spread. The API hands them back best-first, which is the
   * right order for a list and the wrong one for a ladder.
   */
  const askRows = asks.slice(0, ROWS).reverse()
  const bidRows = bids.slice(0, ROWS)

  // One depth scale across both sides, so a bar's length means the same thing
  // above and below the spread. Scaling each side to its own max would make a
  // thin side look as deep as a heavy one.
  const amounts = [...askRows, ...bidRows].map((r) => big(r.amount))
  const maxAmount = amounts.reduce((a, b) => (b.isGreaterThan(a) ? b : a), big(0))
  const barWidth = (amount: string) =>
    maxAmount.isGreaterThan(0) ? Math.max(4, num(big(amount).dividedBy(maxAmount).times(100))) : 4

  const row = (entry: OrderBookEntry, side: 'bid' | 'ask') => {
    const pick = big(entry.price).toFixed(8, ROUND_DOWN)
    const pickable = !!onPickPrice && big(pick).isGreaterThan(0)
    const tone = side === 'bid' ? 'text-green-400' : 'text-red-400'
    const fill = side === 'bid' ? 'bg-green-500/15' : 'bg-red-500/15'
    const body = (
      <>
        <span
          aria-hidden
          className={`absolute inset-y-0 right-0 rounded-lg ${fill}`}
          style={{ width: `${barWidth(entry.amount)}%` }}
        />
        <span className="relative z-10 flex w-full items-baseline justify-between gap-2">
          <span className={`font-medium tabular-nums ${tone}`}>{entry.price}</span>
          <span className="tabular-nums text-zinc-500">{entry.amount}</span>
        </span>
      </>
    )
    const shell =
      'relative flex w-full overflow-hidden rounded-lg border border-transparent px-2 py-1 text-left text-xs transition-colors'
    return (
      <li key={`${side}-${entry.price}-${entry.amount}`}>
        {pickable ? (
          <button
            type="button"
            onClick={() => onPickPrice!(pick)}
            title="Use this price"
            className={`${shell} hover:border-zinc-700 hover:bg-zinc-800/30`}
          >
            {body}
          </button>
        ) : (
          <div className={shell}>{body}</div>
        )}
      </li>
    )
  }

  const empty = !isLoading && askRows.length === 0 && bidRows.length === 0

  return (
    <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-baseline justify-between px-2">
        <h2 className="text-xs text-zinc-400">Order book</h2>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">{quoteLabel}</span>
      </div>

      {isLoading ? (
        <p className="px-2 py-6 text-center text-xs text-zinc-600">Loading…</p>
      ) : empty ? (
        /**
         * Most Counterparty markets have no resting orders at all, so this is
         * a common state rather than an error. It says what it means and what
         * it implies for the person about to place one — being first is an
         * advantage worth naming, not a warning.
         */
        <div className="px-2 py-6 text-center">
          <p className="text-xs text-zinc-400">No resting orders</p>
          <p className="mx-auto mt-1.5 max-w-[13rem] text-[11px] leading-relaxed text-zinc-600">
            Nothing is currently bid or offered on this market. Your order would be the
            only one on the book, at whatever price you set.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-0.5">
            {askRows.length > 0 ? (
              askRows.map((r) => row(r, 'ask'))
            ) : (
              <li className="px-2 py-1 text-[11px] text-zinc-600">No asks</li>
            )}
          </ul>

          {/* The spread is the gap between the two sides, so it is drawn as
              one — a rule with the number on it, not another row. */}
          <div className="my-1.5 flex items-center gap-2 px-2">
            <span className="h-px flex-1 bg-zinc-800" />
            <span className="tabular-nums text-[10px] text-zinc-500">
              {big(spread).isGreaterThan(0) ? `${spread} · ${spreadPct}%` : 'no spread'}
            </span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          <ul className="space-y-0.5">
            {bidRows.length > 0 ? (
              bidRows.map((r) => row(r, 'bid'))
            ) : (
              <li className="px-2 py-1 text-[11px] text-zinc-600">No bids</li>
            )}
          </ul>
        </>
      )}
    </aside>
  )
}
