'use client'

import { Suspense, useMemo, useState } from 'react'
import { useAnalyticsSummary } from '@/lib/hooks/useAnalytics'
import { useTimeframeParam } from '@/lib/hooks/useTimeframeParam'
import { BrowseHeader, HideLowQualityToggle, StatGrid, TimeframePills } from '@/components/browse-controls'
import { CounterCard } from '@/components/home/counter-card'
import { MarketInfoTable, COMPARABLE_QUOTE } from '@/components/market-info-table'
import { formatBig } from '@/utils/format-analytics'

const PAGE_SIZE = 50

/**
 * Every market, ranked.
 *
 * A market is a PAIR — the thing you can put an order into. It is a different
 * object from an asset, which is why both have a tab: PEPECASH is one asset
 * with several markets, and "how is PEPECASH doing" and "which PEPECASH book
 * should I use" are different questions.
 *
 * The table is the dashboard's, at fifty rows instead of ten.
 *
 * The quote filter starts on XCP, and that is a correctness decision rather
 * than a convenience. The default sort is quote volume, which is only an
 * ordering when every row is denominated in the same thing. Unfiltered, it
 * ranked a single trade of 13.8M DANKROSECASH above every real market on the
 * exchange — not a wrong number, but a comparison between units that have no
 * exchange rate here. Pinning the quote makes the column mean one thing, and
 * it agrees with how the rest of the site counts volume (see the XCP-only
 * sums in the analytics endpoint).
 *
 * "All quotes" stays available, with a note, because seeing every market is
 * a legitimate thing to want — just not while trusting the ordering.
 */
// Defined with the table it protects; see components/market-info-table.
export default function ExploreMarketsPage() {
  return <Suspense><ExploreMarketsInner /></Suspense>
}

function ExploreMarketsInner() {
  const [timeframe, setTimeframe] = useTimeframeParam()
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [quote, setQuote] = useState(COMPARABLE_QUOTE)
  const includeHidden = !hideLowQuality

  const { tradeSummary, quoteVolumes, isLoading } = useAnalyticsSummary(timeframe, includeHidden)

  // Only quotes that actually priced a trade in this window — a dropdown of
  // every asset ever used as a quote is mostly dead entries. XCP is listed
  // unconditionally and first: it is the default selection, and a select
  // whose value matches no option renders blank while the summary loads.
  const quoteOptions = useMemo(() => {
    const active = quoteVolumes
      .filter((q) => q.trade_count > 0 && q.quote_asset !== COMPARABLE_QUOTE)
      .map((q) => q.quote_asset)
      .sort((a, b) => a.localeCompare(b))
    return [COMPARABLE_QUOTE, ...active]
  }, [quoteVolumes])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <BrowseHeader title="Markets" subtitle="Every trading pair, ranked by activity">
          <select
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            className="rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-300 outline-none"
          >
            {quoteOptions.map((q) => (
              <option key={q} value={q}>{q} markets</option>
            ))}
            <option value="">All quotes</option>
          </select>
          <HideLowQualityToggle checked={hideLowQuality} onChange={setHideLowQuality} />
          <TimeframePills value={timeframe} onChange={setTimeframe} />
        </BrowseHeader>

        <StatGrid>
          <CounterCard
            label="Active Markets"
            loading={isLoading}
            value={tradeSummary ? tradeSummary.active_pairs.toLocaleString() : '—'}
            sub={tradeSummary ? `${tradeSummary.total_pairs.toLocaleString()} total` : undefined}
          />
          <CounterCard
            label="Trade Volume (XCP)"
            loading={isLoading}
            value={tradeSummary ? `${formatBig(tradeSummary.tf_volume)} XCP` : '—'}
            sub={
              tradeSummary && tradeSummary.tf_trades > 0
                ? `Avg: ${formatBig(tradeSummary.tf_volume / tradeSummary.tf_trades)} XCP`
                : undefined
            }
          />
          <CounterCard
            label="Trades"
            loading={isLoading}
            value={tradeSummary ? tradeSummary.tf_trades.toLocaleString() : '—'}
            sub={tradeSummary?.tf_unique_traders ? `${tradeSummary.tf_unique_traders.toLocaleString()} addresses` : undefined}
          />
          <CounterCard
            label="New Markets"
            loading={isLoading}
            value={tradeSummary ? (tradeSummary.new_pairs ?? 0).toLocaleString() : '—'}
            sub={timeframe === 'all' ? 'all time' : `in ${timeframe}`}
          />
        </StatGrid>

        {!quote && (
          <p className="mb-3 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
            Showing every quote. Quote volume is denominated in each market&apos;s own quote asset, so
            this ordering compares unlike units — sort by <span className="font-medium">Trades</span>,
            or pick a single quote, to rank these fairly.
          </p>
        )}

        <MarketInfoTable
          timeframe={timeframe}
          includeHidden={includeHidden}
          pageSize={PAGE_SIZE}
          quote={quote || undefined}
          heading={false}
        />
      </div>
    </div>
  )
}
