'use client'

import type { ReactNode } from 'react'
import { TogglePills } from '@/components/home/toggle-pills'
import type { Timeframe } from '@/lib/hooks/useAnalytics'

/**
 * The chrome every ranked browse surface wears: Orders, Dispensers, Pools and
 * the homepage analytics.
 *
 * All four had grown their own copy of the same four pieces — the timeframe
 * options, the label map, the "Hide low quality" checkbox and the stat-card
 * grid — which is four places to change when the vocabulary changes and four
 * chances for one of them to drift. The pool page had gone furthest, declaring
 * a `PoolTimeframe` type that was character-for-character the shared
 * `Timeframe`.
 *
 * Nothing here changes how any page looks. It is the groundwork for folding
 * those pages into one Explore surface with tabs: they can only share a tab
 * row once they agree on what a timeframe is.
 */

/** The windows every browse surface offers, in display order. */
export const TIMEFRAMES = ['24h', '30d', '1y', 'all'] as const satisfies readonly Timeframe[]

/** 'all' is the only one whose label isn't just its own value. */
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '24h': '24h',
  '30d': '30d',
  '1y': '1y',
  all: 'All',
}

export function TimeframePills({
  value,
  onChange,
}: {
  value: Timeframe
  onChange: (v: Timeframe) => void
}) {
  return (
    <TogglePills
      options={TIMEFRAMES}
      value={value}
      onChange={onChange}
      label={(tf) => TIMEFRAME_LABELS[tf]}
    />
  )
}

/**
 * Hides assets flagged as junk. Takes the boolean rather than the event so
 * callers that also reset pagination don't each have to unwrap `e.target`.
 */
export function HideLowQualityToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-zinc-500 w-3 h-3"
      />
      <span className="text-xs text-zinc-500">Hide low quality</span>
    </label>
  )
}

/**
 * Page title, one line on what the page is, and a slot for its controls.
 * The slot is a slot because the controls genuinely differ — pools carry a
 * "Create pool" action the other surfaces have no equivalent of.
 */
export function BrowseHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100 mb-1">{title}</h1>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}

/** The four-across summary cards above every browse table. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">{children}</div>
}
