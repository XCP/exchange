'use client'

import Link from 'next/link'
import { usePortfolioDispensers } from '@/lib/hooks/usePortfolio'
import { formatAmount } from '@/utils/format-amount'

export function PortfolioDispensers({ address }: { address: string }) {
  const { dispensers, isLoading } = usePortfolioDispensers(address)

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-500">Loading dispensers...</span></div>
  }

  if (dispensers.length === 0) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-500">No open dispensers</span></div>
  }

  return (
    <div>
      <div className="grid grid-cols-5 gap-0 px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800 max-sm:grid-cols-3">
        <span>Asset</span>
        <span className="text-right">Price (BTC)</span>
        <span className="text-right">Per Dispense</span>
        <span className="text-right max-sm:hidden">Remaining</span>
        <span className="text-right max-sm:hidden">Dispenses</span>
      </div>
      <div className="px-1">
        {dispensers.map((d) => (
          <Link
            key={d.tx_hash}
            href={`/dispense/${d.asset}`}
            className="grid grid-cols-5 gap-0 px-2 py-1.5 text-xs hover:bg-zinc-900 transition-colors max-sm:grid-cols-3"
          >
            <span className="text-zinc-100 font-medium">{d.asset}</span>
            <span className="text-right text-zinc-300 font-mono">{formatAmount(d.price_normalized)}</span>
            <span className="text-right text-zinc-300 font-mono">{d.give_quantity_normalized}</span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">{d.give_remaining_normalized}</span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">{d.dispense_count}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
