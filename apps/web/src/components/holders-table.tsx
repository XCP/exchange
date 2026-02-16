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
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-950 z-10">
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5">Address</th>
          <th className="text-right font-normal px-2 py-1.5">Balance</th>
          <th className="text-right font-normal px-2 py-1.5">% Supply</th>
        </tr>
      </thead>
      <tbody>
        {holders.map((holder) => (
          <tr key={holder.address} className="hover:bg-zinc-900 cursor-default">
            <td className="text-zinc-400 font-mono px-2 py-1">
              {holder.address}
              {holder.tag && (
                <span className="ml-1.5 text-yellow-500/80">({holder.tag})</span>
              )}
            </td>
            <td className="text-right text-zinc-400 font-mono px-2 py-1">{holder.balance}</td>
            <td className="text-right text-zinc-500 font-mono px-2 py-1">{holder.percentage.toFixed(2)}%</td>
          </tr>
        ))}
        {remainingCount > 0 && (
          <tr className="border-t border-zinc-800/50">
            <td className="text-zinc-600 px-2 py-2">
              And <span className="text-zinc-400">{remainingCount.toLocaleString()}</span> more holders
            </td>
            <td />
            <td className="text-right text-zinc-600 font-mono px-2 py-2">{remainingPct.toFixed(2)}%</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
