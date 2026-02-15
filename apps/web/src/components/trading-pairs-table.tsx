'use client'

import Link from 'next/link'
import { formatAmount } from '@/utils/format-amount'
import type { TradingPairSummary } from '@/types/trading'

interface TradingPairsTableProps {
  pairs: TradingPairSummary[]
  isLoading: boolean
}

export function TradingPairsTable({ pairs, isLoading }: TradingPairsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-zinc-500">Loading markets...</span>
      </div>
    )
  }

  if (pairs.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-zinc-600">No trading pairs found</span>
      </div>
    )
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
        <span>Pair</span>
        <span className="text-right">Price</span>
        <span className="text-right max-sm:hidden">7d Change</span>
        <span className="text-right max-sm:hidden">Market Cap</span>
        <span className="text-right">Vol (7d)</span>
        <span className="text-right max-sm:hidden">Trades</span>
      </div>

      {/* Rows */}
      <div>
        {pairs.map((pair) => {
          const change = pair.price_change_7d != null ? parseFloat(pair.price_change_7d) : null
          const isPositive = change != null && change >= 0

          return (
            <Link
              key={pair.slug}
              href={`/orders/${pair.slug}`}
              className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
            >
              <span className="text-zinc-200 font-medium">{pair.name}</span>
              <span className="text-right text-zinc-300 font-mono">
                {pair.last_trade_price != null ? formatAmount(pair.last_trade_price) : '—'}
              </span>
              <span className={`text-right font-mono max-sm:hidden ${
                change == null ? 'text-zinc-600' : isPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                {change != null ? `${isPositive ? '+' : ''}${change.toFixed(1)}%` : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {pair.market_cap_usd ? `$${formatAmount(pair.market_cap_usd, true)}` : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono">
                {pair.volume_7d_usd ? `$${formatAmount(pair.volume_7d_usd, true)}` : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {pair.trades_7d ?? '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
