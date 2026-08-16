'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useMarkets, type MarketSort } from '@/lib/hooks/useMarkets'

/**
 * The one quote currency that makes a volume column comparable down its own
 * length.
 *
 * Volume is denominated in each market's OWN quote asset, so ranking across
 * quotes sorts 6.9M DANKROSECASH above 328K XCP — a bigger number in a unit
 * worth vastly less. Restricting to a single quote is the only honest way to
 * order the list, and XCP is the one that prices 6,378 of the network's
 * markets.
 */
export const COMPARABLE_QUOTE = 'XCP'
import type { Timeframe } from '@/lib/hooks/useAnalytics'
import { formatAmount } from '@/utils/format-amount'
import { formatPct, pctColor } from '@/utils/format-analytics'
import { XCP_IMG_BASE } from '@/utils/constants'
import { marketPath } from '@/utils/pairs'

interface Column {
  key: MarketSort
  label: (tf: Timeframe) => string
  /** Hidden for a window where the underlying stat has no meaning. */
  hidden?: (tf: Timeframe) => boolean
}

// All-time rows carry no price change (there is no "before" to compare against)
// and their high/low are the all-time extremes rather than a windowed range.
const COLUMNS: Column[] = [
  { key: 'last_price', label: () => 'Last price' },
  { key: 'price_change', label: (tf) => `${tf === 'all' ? '' : tf} change`.trim(), hidden: (tf) => tf === 'all' },
  { key: 'high', label: (tf) => (tf === 'all' ? 'ATH' : `${tf} high`) },
  { key: 'low', label: (tf) => (tf === 'all' ? 'ATL' : `${tf} low`) },
  { key: 'base_volume', label: (tf) => (tf === 'all' ? 'Base volume' : `${tf} base volume`) },
  { key: 'volume', label: (tf) => (tf === 'all' ? 'Quote volume' : `${tf} quote volume`) },
  { key: 'trades', label: () => 'Trades' },
]

const WINDOW_COPY: Record<Timeframe, string> = {
  '24h': 'the last 24 hours',
  '30d': 'the last 30 days',
  '1y': 'the last year',
  all: 'all time',
}

/**
 * The ranked list of spot markets.
 *
 * One implementation, two homes: a ten-row teaser on the dashboard and the
 * full surface at /explore/markets. They differ only in page size and in
 * whether they need their own heading — the sorting, the windowed column
 * labels and the pagination are the same product either way, and were not
 * worth a second copy that could disagree with this one about what "24h
 * volume" means.
 */
export function MarketInfoTable({
  timeframe,
  includeHidden,
  pageSize = 10,
  quote,
  heading = true,
}: {
  timeframe: Timeframe
  includeHidden: boolean
  pageSize?: number
  /** Restrict to markets priced in this asset. */
  quote?: string
  /** Off when the surrounding page already titles the section. */
  heading?: boolean
}) {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<MarketSort>('volume')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const PAGE_SIZE = pageSize

  const columns = COLUMNS.filter((c) => !c.hidden?.(timeframe))
  // Switching to All while sorted by change would rank every row on a constant
  // 0, so fall back rather than carrying a sort the window cannot express.
  const activeSort = columns.some((c) => c.key === sort) ? sort : 'volume'

  // Page 12 of the 24h list is rarely page 12 of the 1y list; start over when
  // the underlying set changes, or the reader lands on a page past the end.
  const listKey = `${timeframe}:${includeHidden}:${quote ?? ''}`
  const [lastListKey, setLastListKey] = useState(listKey)
  if (lastListKey !== listKey) {
    setLastListKey(listKey)
    setPage(0)
  }

  const { markets, total, isLoading } = useMarkets({
    timeframe,
    sort: activeSort,
    order,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    includeHidden,
    quote,
  })

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleSort = (key: MarketSort) => {
    if (key === activeSort) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
    } else {
      setSort(key)
      setOrder('desc')
    }
    setPage(0)
  }

  return (
    <section aria-labelledby={heading ? 'markets-heading' : undefined} className="mb-8">
      {heading && (
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="markets-heading" className="text-sm uppercase tracking-wider text-zinc-400">
              Markets
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Spot markets that traded in {WINDOW_COPY[timeframe]}, by completed trading volume. No derivatives or open interest.
            </p>
          </div>
          <div className="flex gap-3 text-[11px]">
            <Link href="/methodology" className="text-green-400 hover:text-green-300">Methodology</Link>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/50">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-normal">Pair</th>
                {columns.map((col) => {
                  const isActive = activeSort === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`cursor-pointer select-none px-3 py-2 text-right font-normal hover:text-zinc-400${isActive ? ' text-zinc-300' : ''}`}
                    >
                      {col.label(timeframe)} {isActive ? (order === 'desc' ? '▼' : '▲') : ''}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {markets.map((market) => (
                <tr key={market.pair} className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50">
                  <td className="px-3 py-2">
                    <Link
                      href={marketPath(market.pair)}
                      className="flex items-center gap-1.5 font-medium text-zinc-200 hover:text-green-400"
                    >
                      <Image
                        src={`${XCP_IMG_BASE}/icon/${market.base_asset}`}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-sm"
                        sizes="14px"
                        unoptimized
                      />
                      {market.base_asset_longname ?? market.base_asset}/{market.quote_asset}
                    </Link>
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={`px-3 py-2 text-right font-mono tabular-nums ${cellClass(col.key, market.price_change)}`}>
                      {cellValue(col.key, market)}
                    </td>
                  ))}
                </tr>
              ))}
              {!isLoading && markets.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="py-8 text-center text-zinc-500">No markets traded in this period</td></tr>
              )}
              {isLoading && markets.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="py-8 text-center text-zinc-500">Loading market data...</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
            <span>{total.toLocaleString()} active spot {total === 1 ? 'market' : 'markets'}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-sm border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40">
                Previous
              </button>
              <span>Page {page + 1} of {pageCount}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page + 1 >= pageCount} className="rounded-sm border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function cellClass(key: MarketSort, priceChange: number | null): string {
  return key === 'price_change' ? pctColor(priceChange) : 'text-zinc-400'
}

function cellValue(
  key: MarketSort,
  market: ReturnType<typeof useMarkets>['markets'][number]
): string {
  switch (key) {
    case 'last_price':
      return market.last_price != null ? `${formatAmount(market.last_price)} ${market.quote_asset}` : '—'
    case 'price_change':
      return formatPct(market.price_change)
    case 'high':
      return market.high != null ? formatAmount(market.high) : '—'
    case 'low':
      return market.low != null ? formatAmount(market.low) : '—'
    case 'base_volume':
      return market.base_volume ? `${formatAmount(market.base_volume)} ${market.base_asset}` : '—'
    case 'volume':
      return market.volume ? `${formatAmount(market.volume)} ${market.quote_asset}` : '—'
    case 'trades':
      return market.trade_count != null ? market.trade_count.toLocaleString() : '—'
    default:
      return '—'
  }
}
