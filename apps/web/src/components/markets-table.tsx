'use client'

import Link from 'next/link'
import { useAssetMarkets } from '@/lib/hooks/useAssetMarkets'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { marketPath } from '@/utils/pairs'

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
        <span className="text-xs text-zinc-500">No other markets found</span>
      </div>
    )
  }

  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead className="sticky top-0 bg-zinc-950 z-10">
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5">Pair</th>
          <th className="text-right font-normal px-2 py-1.5">Price</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">24h Vol</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Trades</th>
          <th className="text-right font-normal px-2 py-1.5">24h %</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => {
          const isCurrent = p.pair === currentPair
          const slug = p.pair.replace('/', '_')
          const [rawBase, quote] = p.pair.split('/')
          const displayPair = `${p.base_asset_longname ?? rawBase}/${quote}`
          return (
            <tr key={p.pair} className={`hover:bg-zinc-800/50 transition-colors ${isCurrent ? 'bg-zinc-900/50' : ''}`}>
              <td className="px-2 py-1.5">
                <Link href={marketPath(p.pair)} className="text-zinc-100 font-medium hover:underline">
                  {displayPair}
                </Link>
              </td>
              <td className="text-right text-zinc-300 font-mono px-2 py-1.5">
                {p.last_price != null ? formatAmount(p.last_price) : '—'}
              </td>
              <td className="text-right text-zinc-500 font-mono px-2 py-1.5 max-sm:hidden">
                {p.volume_24h != null && p.volume_24h > 0 ? formatAmount(p.volume_24h) : '—'}
              </td>
              <td className="text-right text-zinc-500 font-mono px-2 py-1.5 max-sm:hidden">
                {p.trade_count_24h ?? '—'}
              </td>
              <td className={`text-right font-mono px-2 py-1.5 ${
                p.price_change_24h != null && p.price_change_24h >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}>
                {p.price_change_24h != null
                  ? `${p.price_change_24h >= 0 ? '+' : ''}${p.price_change_24h.toFixed(1)}%`
                  : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
