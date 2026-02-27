'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMarkets, type MarketEntry } from '@/lib/hooks/useMarkets'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'

const QUOTE_FILTERS = ['All', 'XCP', 'BTC', 'PEPECASH'] as const

export default function HomePage() {
  const [activeQuote, setActiveQuote] = useState<string>('All')
  const quote = activeQuote === 'All' ? undefined : activeQuote
  const { markets, isLoading } = useMarkets(quote, 100)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Markets</h1>
          <p className="text-xs text-zinc-500">Active markets on the Counterparty DEX with open orders</p>
        </div>

        {/* Quote asset filter */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto">
          {QUOTE_FILTERS.map((q) => (
            <button
              key={q}
              onClick={() => setActiveQuote(q)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap ${
                activeQuote === q
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        <MarketsTable markets={markets} isLoading={isLoading} />
      </div>
    </div>
  )
}

function MarketsTable({ markets, isLoading }: { markets: MarketEntry[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-zinc-500">Loading markets...</span>
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-zinc-600">No active markets found</span>
      </div>
    )
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
        <span>Pair</span>
        <span className="text-right">Price</span>
        <span className="text-right max-sm:hidden">24h Change</span>
        <span className="text-right">24h Vol</span>
        <span className="text-right max-sm:hidden">Orders</span>
        <span className="text-right max-sm:hidden">Spread</span>
      </div>

      {/* Rows */}
      <div>
        {markets.map((m) => {
          const slug = m.pair.replace('/', '_')
          const change = m.price_change_24h
          const isPositive = change != null && change >= 0

          return (
            <Link
              key={m.pair}
              href={`/trade/${slug}`}
              className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
            >
              <span className="text-zinc-200 font-medium">{m.pair}</span>
              <span className="text-right text-zinc-300 font-mono">
                {m.last_price != null ? formatAmount(m.last_price) : '—'}
              </span>
              <span className={`text-right font-mono max-sm:hidden ${
                change == null ? 'text-zinc-600' : isPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                {change != null ? `${isPositive ? '+' : ''}${change.toFixed(1)}%` : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono">
                {m.volume_24h != null ? formatAmount(m.volume_24h) : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {m.open_orders}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {m.spread != null && m.spread > 0 ? `${(m.spread * 100).toFixed(1)}%` : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
