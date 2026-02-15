'use client'

import Link from 'next/link'
import { useAssetMarkets } from '@/lib/hooks/useAssetMarkets'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'

interface MarketsTableProps {
  asset: string
  currentPair?: string
}

export function MarketsTable({ asset, currentPair }: MarketsTableProps) {
  const { pairs, isLoading } = useAssetMarkets(asset)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-500">Loading markets...</span>
      </div>
    )
  }

  if (pairs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-600">No other markets found</span>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-5 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800 max-sm:grid-cols-3">
        <span>Pair</span>
        <span className="text-right">Price</span>
        <span className="text-right max-sm:hidden">24h Vol</span>
        <span className="text-right max-sm:hidden">Trades</span>
        <span className="text-right">24h %</span>
      </div>
      <div className="px-1">
        {pairs.map((p) => {
          const isCurrent = p.pair === currentPair
          const slug = p.pair.replace('/', '_')
          return (
            <Link
              key={p.pair}
              href={`/trade/${slug}`}
              className={`grid grid-cols-5 gap-0 px-2 py-1.5 text-xs hover:bg-zinc-900 transition-colors max-sm:grid-cols-3 ${
                isCurrent ? 'bg-zinc-900/50' : ''
              }`}
            >
              <span className="text-zinc-100 font-medium">{p.pair}</span>
              <span className="text-right text-zinc-300 font-mono">
                {p.last_price != null ? formatAmount(p.last_price) : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {p.volume_24h != null && p.volume_24h > 0 ? formatAmount(p.volume_24h) : '—'}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {p.trade_count_24h ?? '—'}
              </span>
              <span className={`text-right font-mono ${
                p.price_change_24h != null && p.price_change_24h >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}>
                {p.price_change_24h != null
                  ? `${p.price_change_24h >= 0 ? '+' : ''}${p.price_change_24h.toFixed(1)}%`
                  : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
