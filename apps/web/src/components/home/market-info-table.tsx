'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import { dexUrl } from '@/lib/api/client'

interface MarketTicker {
  ticker_id: string
  base_currency: string
  target_currency: string
  last_price: string
  base_volume: string
  target_volume: string
  high: string
  low: string
  is_stale: boolean
}

const PAGE_SIZE = 10

function decimal(value: string): string {
  const [whole, fraction = ''] = value.split('.')
  const compactFraction = fraction.replace(/0+$/, '')
  const grouped = Number.isFinite(Number(whole)) ? Number(whole).toLocaleString('en-US') : whole
  return compactFraction ? `${grouped}.${compactFraction}` : grouped
}

export function MarketInfoTable() {
  const [page, setPage] = useState(0)
  const { data: tickers, isLoading } = useDexSWR<MarketTicker[]>(dexUrl('/coingecko/tickers'))
  const pageCount = Math.max(1, Math.ceil((tickers?.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)

  const rows = useMemo(
    () => (tickers ?? []).slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [currentPage, tickers]
  )

  return (
    <section aria-labelledby="markets-heading" className="mb-8">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="markets-heading" className="text-sm uppercase tracking-wider text-zinc-400">
            Markets
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Spot market prices and completed trading volume over the last 24 hours. No derivatives or open interest.
          </p>
        </div>
        <div className="flex gap-3 text-[11px]">
          <Link href="/methodology" className="text-green-400 hover:text-green-300">Methodology</Link>
          <a href={dexUrl('/coingecko/tickers')} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300">
            Market API
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/50">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-normal">Pair</th>
                <th className="px-3 py-2 text-right font-normal">Last price</th>
                <th className="px-3 py-2 text-right font-normal">24h high</th>
                <th className="px-3 py-2 text-right font-normal">24h low</th>
                <th className="px-3 py-2 text-right font-normal">24h base volume</th>
                <th className="px-3 py-2 text-right font-normal">24h quote volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ticker) => (
                <tr key={ticker.ticker_id} className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50">
                  <td className="px-3 py-2">
                    <Link href={`/trade/${ticker.ticker_id}`} className="font-medium text-zinc-200 hover:text-green-400">
                      {ticker.base_currency}/{ticker.target_currency}
                    </Link>
                    {ticker.is_stale && <span className="ml-2 text-[10px] text-amber-400">Stale</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">{decimal(ticker.last_price)} {ticker.target_currency}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">{decimal(ticker.high)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">{decimal(ticker.low)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">{decimal(ticker.base_volume)} {ticker.base_currency}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">{decimal(ticker.target_volume)} {ticker.target_currency}</td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-zinc-500">No market data available</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={6} className="py-8 text-center text-zinc-500">Loading 24-hour market data...</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && (tickers?.length ?? 0) > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
            <span>{tickers?.length ?? 0} spot markets</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="rounded-sm border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40">
                Previous
              </button>
              <span>Page {currentPage + 1} of {pageCount}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={currentPage + 1 >= pageCount} className="rounded-sm border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
