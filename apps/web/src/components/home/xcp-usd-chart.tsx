'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { type Time } from 'lightweight-charts'
import { PriceChart, MARKER_COLOR } from '@/components/price-chart'
import { PRICE_EVENTS } from '@/lib/price-events'
import { usePriceHistory } from '@/lib/hooks/usePriceHistory'
import { XCP_IMG_BASE } from '@/utils/constants'

/**
 * XCP in dollars, all of it, for the homepage hero.
 *
 * The chart itself is the same component /price/XCP draws — extracted rather
 * than copied, so the two cannot drift. This wrapper only decides what is
 * charted (the deep calendar plus the live dispenser ask as today's endpoint,
 * every row, no window switcher) and what the header says.
 *
 * All-time is the only honest default here: XCP has twelve years of history
 * and a shorter window on a thin market is mostly flat line.
 *
 * DELIBERATELY UNRELATED TO THE FORM BESIDE IT. This is not the market chart
 * for whatever pair the trade rail is quoting — it is the price of the
 * protocol's token, which is context for being on the site at all. Coupling
 * them would mean the price of Counterparty moving because someone picked a
 * different asset to swap.
 */
export function XcpUsdChart() {
  const { rows, isLoading } = usePriceHistory(true)
  /**
   * Off until asked for, same as the price page: unexplained marks on a line
   * read as a defect — the first question becomes "what are these?" rather
   * than "what happened here?". Behind a button they arrive already answered.
   */
  const [annotations, setAnnotations] = useState(false)

  const series = useMemo(
    () =>
      rows.map((r) => ({
        time: Math.floor(Date.parse(`${r.day}T00:00:00Z`) / 1000) as Time,
        value: r.xcp,
      })),
    [rows],
  )

  const first = rows[0]
  const last = rows.at(-1)
  const price = last?.xcp ?? null
  const change = first && last && first.xcp > 0 ? ((last.xcp - first.xcp) / first.xcp) * 100 : null

  return (
    <div>
      {/* The header the price page carries: what it costs, how far it has
          moved across the window drawn, and both endpoints spelled out so the
          percentage has something to be a percentage OF. */}
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Image
          src={`${XCP_IMG_BASE}/icon/XCP`}
          alt=""
          width={28}
          height={28}
          className="rounded-full"
          unoptimized
        />
        <span className="font-mono text-3xl tabular-nums text-zinc-100">
          {price != null ? usd(price) : '—'}
        </span>
        {change != null && (
          <span
            className={`font-mono text-sm ${change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-zinc-500'}`}
          >
            {change > 0 ? '+' : ''}
            {Math.abs(change) >= 1000 ? change.toFixed(0) : change.toFixed(1)}%{' '}
            <span className="text-zinc-600">all time</span>
          </span>
        )}

        <button
          type="button"
          onClick={() => setAnnotations((v) => !v)}
          aria-pressed={annotations}
          className={`ml-auto hidden shrink-0 rounded-sm border px-2 py-1 text-[11px] transition-colors md:inline-flex ${
            annotations
              ? 'border-green-500/40 bg-green-500/10 text-green-400'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          }`}
        >
          {/* A sample of the thing being switched on, so the control shows its
              own effect rather than naming it. */}
          <span
            aria-hidden
            className="mr-1.5 inline-flex size-1.5 shrink-0 self-center rounded-full transition-colors"
            style={{ backgroundColor: annotations ? MARKER_COLOR : '#a1a1aa' }}
          />
          Annotations
        </button>
      </div>

      {first && last && (
        <p className="mb-3 font-mono text-[11px] text-zinc-500">
          {usd(first.xcp)} <span className="text-zinc-600">{first.day}</span>
          {' → '}
          {usd(last.xcp)} <span className="text-zinc-600">{last.day}</span>
          <Link href="/price/XCP" className="ml-2 text-zinc-500 hover:text-zinc-300">
            history →
          </Link>
        </p>
      )}

      <PriceChart data={series} coin="XCP" events={annotations ? PRICE_EVENTS : []} />
      {isLoading && series.length === 0 && (
        <p className="py-16 text-center text-xs text-zinc-500">Loading price history…</p>
      )}
    </div>
  )
}

/** Dollars at a precision that suits the magnitude — XCP has traded under $1. */
function usd(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 4 : 2 })}`
}
