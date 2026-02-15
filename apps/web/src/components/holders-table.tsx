'use client'

import { useHolders } from '@/lib/hooks/useHolders'

interface HoldersTableProps {
  asset: string
  totalSupply: number
}

export function HoldersTable({ asset, totalSupply }: HoldersTableProps) {
  const { holders, total, isLoading } = useHolders(asset, totalSupply)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-500">Loading holders...</span>
      </div>
    )
  }

  if (holders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-600">No holders found</span>
      </div>
    )
  }

  const topPct = holders.reduce((sum, h) => sum + h.percentage, 0)
  const remainingCount = total - holders.length
  const remainingPct = Math.max(0, 100 - topPct)

  return (
    <div>
      <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800">
        <span>Address</span>
        <span className="text-right">Balance</span>
        <span className="text-right">% Supply</span>
      </div>
      <div className="px-1">
        {holders.map((holder) => (
          <div
            key={holder.address}
            className="grid grid-cols-3 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-default"
          >
            <span className="text-zinc-400 font-mono">
              {holder.addressShort}
              {holder.tag && (
                <span className="ml-1.5 text-yellow-500/80">({holder.tag})</span>
              )}
            </span>
            <span className="text-right text-zinc-400 font-mono">{holder.balance}</span>
            <span className="text-right text-zinc-500 font-mono">{holder.percentage.toFixed(2)}%</span>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="grid grid-cols-3 gap-0 px-2 py-2 text-xs border-t border-zinc-800/50 mt-1">
            <span className="text-zinc-600">
              And <span className="text-zinc-400">{remainingCount.toLocaleString()}</span> more holders
            </span>
            <span />
            <span className="text-right text-zinc-600 font-mono">{remainingPct.toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}
