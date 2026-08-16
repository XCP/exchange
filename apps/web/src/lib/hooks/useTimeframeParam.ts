'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Timeframe } from '@/lib/hooks/useAnalytics'
import { TIMEFRAMES } from '@/components/browse-controls'
import { usePreference } from '@/lib/preferences'

/**
 * The timeframe, carried in the URL so it survives moving between the Explore
 * tabs.
 *
 * "Where is the liquidity for this asset — book, dispensers, or pool?" is one
 * question asked of three surfaces, and having the window reset to 24h on each
 * hop made the comparison useless. Putting it in the query string also makes
 * the view shareable, which in-memory state never would be.
 *
 * The URL is updated with the native History API rather than `router.replace`.
 * These pages hold a lot besides the timeframe — filters, sort column, page
 * offset — and a route-level replace re-runs the segment and can remount the
 * client component, discarding all of it. The same trap the trading forms hit;
 * see `replacePairPath` in lib/trade-routes.
 *
 * The consequence is that `useSearchParams` will NOT observe the write, so
 * local state is the source of truth after mount and the URL is a mirror kept
 * in step. Anything needing the live value across components must read
 * `window.location` at the moment it needs it — which is what the tab links do.
 */
/**
 * All time, not 24h.
 *
 * Counterparty is not a venue where recency is a representative sample: 95%
 * of even the top 500 markets have not traded in a year, and 37% have fewer
 * than three trades ever. Any bounded window makes most of every browse table
 * read as empty — which is true of the window and false of the market. All
 * time is the only one that describes the thing itself rather than the last
 * few days of it, and the pills are right there when a reader wants recency.
 */
const DEFAULT: Timeframe = 'all'

const isTimeframe = (v: unknown): v is Timeframe =>
  typeof v === 'string' && (TIMEFRAMES as readonly string[]).includes(v)

export function parseTimeframe(value: string | null | undefined): Timeframe | null {
  return value && (TIMEFRAMES as readonly string[]).includes(value) ? (value as Timeframe) : null
}

export function useTimeframeParam(): [Timeframe, (next: Timeframe) => void] {
  const params = useSearchParams()
  /**
   * The window is REMEMBERED, so picking 1y on Assets and then opening
   * Dispensers from the main nav still shows a year. The URL only carried it
   * between the Explore tabs, which share a tab row; every other route into
   * these pages dropped it.
   *
   * It qualifies as a preference under the rule in lib/preferences: it is an
   * answer to "how do I like to look at this", not to "what am I doing right
   * now", and restoring it can mislead nobody — the pills show the answer.
   */
  const [stored, setStored] = usePreference<Timeframe>('timeframe', DEFAULT, isTimeframe)

  /**
   * An explicit ?tf wins over the memory, but only until the first change:
   * a shared link should open on the window it names, and then hand control
   * back rather than pinning the page to it forever.
   */
  const [linked, setLinked] = useState<Timeframe | null>(() => parseTimeframe(params.get('tf')))
  const timeframe = linked ?? stored

  const update = (next: Timeframe) => {
    setLinked(null)
    setStored(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    // The default stays out of the URL — a bare /explore/orders should not
    // acquire ?tf=all just for being looked at.
    if (next === DEFAULT) url.searchParams.delete('tf')
    else url.searchParams.set('tf', next)
    window.history.replaceState(null, '', url)
  }

  return [timeframe, update]
}
