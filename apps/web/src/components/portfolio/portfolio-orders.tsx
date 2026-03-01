'use client'

import Link from 'next/link'
import { usePortfolioOrders } from '@/lib/hooks/usePortfolio'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'

export function PortfolioOrders({ address }: { address: string }) {
  const { orders, isLoading } = usePortfolioOrders(address)

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-500">Loading orders...</span></div>
  }

  if (orders.length === 0) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-600">No open orders</span></div>
  }

  return (
    <div>
      <div className="grid grid-cols-6 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800 max-sm:grid-cols-4">
        <span>Pair</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right max-sm:hidden">Remaining</span>
        <span className="text-right max-sm:hidden">Time</span>
      </div>
      <div className="px-1">
        {orders.map((o) => (
          <Link
            key={o.tx_hash}
            href={`/trade/${o.pair.replace('/', '_')}`}
            className="grid grid-cols-6 gap-0 px-2 py-1.5 text-xs hover:bg-zinc-900 transition-colors max-sm:grid-cols-4"
          >
            <span className="text-zinc-100 font-medium">{o.pair}</span>
            <span className={o.side === 'bid' ? 'text-green-400' : 'text-red-400'}>{o.side === 'bid' ? 'Buy' : 'Sell'}</span>
            <span className="text-right text-zinc-300 font-mono">{formatAmount(o.price)}</span>
            <span className="text-right text-zinc-300 font-mono">{formatAmount(o.amount)}</span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAmount(o.remaining)}</span>
            <span className="text-right text-zinc-600 font-mono max-sm:hidden">{o.block_time ? formatTimeAgo(o.block_time) : '—'}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
