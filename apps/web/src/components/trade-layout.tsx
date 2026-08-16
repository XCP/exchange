'use client'

import type { ReactNode } from 'react'
import { Tabs, SegmentedList, SegmentedTrigger } from '@/components/ui/tabs'

/**
 * The frame all four trading surfaces share: a segmented control with the
 * chart toggle and settings gear beside it, and the form card under it.
 *
 * `split` widens the frame into a card + aside grid. The two cells come from
 * `children` (a `contents` wrapper), not from separate props, so a page whose
 * aside reflects what's typed in the form — /buy and /sell both do — can keep
 * that state inside the form instead of hoisting it up here.
 *
 * `chart` opens to the LEFT of the form rather than above or below it. The
 * form is the thing being used; pushing it down the page to make room for
 * context would be backwards, and the widths grow instead so the form never
 * moves from where the eye left it.
 *
 * The tab row here is the page's own — the side on /limit and /buy//sell, the
 * mode on /swap. The TradeTabs row above it moves between the four pages, so
 * the two rows are a hierarchy rather than a duplication: which surface, then
 * what to do on it.
 *
 * The activity tables that used to sit underneath are gone for now. Their
 * components (activity-tabs and the tables it composes) are kept, so bringing
 * the block back is re-adding it here rather than rebuilding it.
 */
export function TradeLayout({
  modes,
  mode,
  onModeChange,
  settings,
  children,
  split,
  chart,
  chartOpen,
  onChartToggle,
}: {
  /** The in-page modes, e.g. ['buy','sell'] — not the site's pages. */
  modes: readonly string[]
  mode: string
  onModeChange: (mode: string) => void
  /** The gear popover, rendered opposite the tabs. */
  settings?: ReactNode
  /** With `split`, render exactly two cells wrapped in `contents`. */
  children: ReactNode
  split?: boolean
  /** The price panel. Only mounted while open, so it costs nothing closed. */
  chart?: ReactNode
  chartOpen?: boolean
  onChartToggle?: () => void
}) {
  const showChart = !!chart && !!chartOpen
  // Four widths for four combinations. The form column keeps its size in all
  // of them; only the space around it changes.
  const width = showChart
    ? split
      ? 'max-w-6xl'
      : 'max-w-4xl'
    : split
      ? 'max-w-3xl'
      : 'max-w-lg'

  const form = split ? (
    <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]">{children}</div>
  ) : (
    children
  )

  const header = (
    <div className="flex items-center justify-between gap-2">
      <Tabs value={mode} onValueChange={onModeChange}>
        <SegmentedList className="w-64">
          {modes.map((m) => (
            <SegmentedTrigger key={m} value={m}>
              {m}
            </SegmentedTrigger>
          ))}
        </SegmentedList>
      </Tabs>
      <div className="flex items-center gap-0.5">
        {onChartToggle && <ChartToggle open={!!chartOpen} onClick={onChartToggle} />}
        {settings}
      </div>
    </div>
  )

  // No footer under these pages, so the card floats: it needs air above it to
  // sit as a deliberate object rather than crowd the nav.
  return (
    <div className={`mx-auto px-4 pb-24 pt-16 ${width}`}>
      {showChart ? (
        /**
         * Explicitly placed rather than ordered, because the tab row belongs
         * to the FORM: it switches what the form does, and the chart is
         * reference material beside it. Putting the header in the same column
         * as the form and on its own row lets the chart start level with the
         * form card instead of level with the tabs — no magic offset needed to
         * line the two cards up.
         *
         * DOM order is header → form → chart so the small-screen stack, where
         * the placement classes don't apply, still reads tabs-then-form.
         */
        <div className="grid gap-x-5 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="lg:col-start-2 lg:row-start-1">{header}</div>
          <div className="lg:col-start-2 lg:row-start-2">{form}</div>
          <div className="lg:col-start-1 lg:row-start-2">{chart}</div>
        </div>
      ) : (
        <>
          <div className="mb-4">{header}</div>
          {form}
        </>
      )}
    </div>
  )
}

/** The trending-up toggle beside the gear. */
function ChartToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle price chart"
      aria-pressed={open}
      className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
        open ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="M3 17l6-6 4 4 7-7" />
        <path d="M15 8h6v6" />
      </svg>
    </button>
  )
}
