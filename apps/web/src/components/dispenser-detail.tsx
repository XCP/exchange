'use client'

import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatAmount } from '@/utils/format-amount'
import { formatAddress } from '@/utils/format-address'
import { usePendingDispenses } from '@/lib/hooks/usePendingDispenses'
import type { Dispenser } from '@/types/trading'

interface DispenserDetailProps {
  dispenser: Dispenser | undefined
  asset: string
  isLoading: boolean
}

export function DispenserDetail({ dispenser, asset, isLoading }: DispenserDetailProps) {
  const { pendingCount } = usePendingDispenses(dispenser?.source)

  if (isLoading) {
    return (
      <div className="border-b border-zinc-800 flex items-center justify-center" style={{ minHeight: '300px' }}>
        <span className="text-sm text-zinc-500">Loading dispensers...</span>
      </div>
    )
  }

  if (!dispenser) {
    return (
      <div className="border-b border-zinc-800 flex items-center justify-center" style={{ minHeight: '300px' }}>
        <span className="text-sm text-zinc-600">No open dispensers for {asset}</span>
      </div>
    )
  }

  const remainingPct = dispenser.escrow_quantity > 0
    ? (dispenser.give_remaining / dispenser.escrow_quantity) * 100
    : 0
  const dispensedPct = 100 - remainingPct

  return (
    <div className="border-b border-zinc-800 flex flex-col" style={{ minHeight: '300px' }}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 bg-zinc-900/30">
        <span className="text-xs font-medium text-zinc-400">Selected Dispenser</span>
        <span className="text-[11px] text-zinc-600 font-mono">
          {formatAddress(dispenser.source)}
        </span>
      </div>

      {/* Pending dispenses warning */}
      {pendingCount > 0 && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2">
          <span className="text-yellow-400 text-xs">⏳</span>
          <span className="text-xs text-yellow-400">
            {pendingCount} pending dispense{pendingCount > 1 ? 's' : ''} in mempool
          </span>
        </div>
      )}

      {/* Main content — centered vertically */}
      <div className="flex-1 flex flex-col justify-center px-4 py-5">
        {/* Price hero */}
        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-2xl font-semibold text-green-400 font-mono">
            {formatAmount(dispenser.price_normalized)}
          </span>
          <span className="text-xs text-zinc-500">BTC / {asset}</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Per Dispense</div>
            <div className="text-sm text-zinc-200 font-mono">{formatAmount(dispenser.satoshi_price_normalized)} BTC</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Tokens / Dispense</div>
            <div className="text-sm text-zinc-200 font-mono">{formatAmount(dispenser.give_quantity_normalized)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Dispensed</div>
            <div className="text-sm text-zinc-200 font-mono">{dispenser.dispense_count}×</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Created</div>
            <div className="text-sm text-zinc-200 font-mono">
              {dispenser.block_time ? formatTimeAgo(dispenser.block_time) : '—'}
            </div>
          </div>
        </div>

        {/* Supply bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">Supply</span>
            <span className="text-xs text-zinc-400 font-mono">
              {formatAmount(dispenser.give_remaining_normalized)} / {formatAmount(dispenser.escrow_quantity_normalized)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-sm overflow-hidden relative">
            <div
              className="h-full bg-green-500/60 rounded-sm transition-all"
              style={{ width: `${remainingPct}%` }}
            />
            {pendingCount > 0 && (
              <div
                className="absolute top-0 h-full bg-yellow-500/40 rounded-sm animate-pulse"
                style={{
                  right: `${100 - remainingPct}%`,
                  width: `${Math.min(pendingCount * dispenser.give_quantity / dispenser.escrow_quantity * 100, remainingPct)}%`,
                }}
              />
            )}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[9px] text-zinc-600">{dispensedPct.toFixed(0)}% dispensed</span>
            <span className="text-[9px] text-zinc-600">
              {remainingPct.toFixed(0)}% remaining
              {pendingCount > 0 && (
                <span className="text-yellow-500"> ({pendingCount} pending)</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Footer — source + tx */}
      <div className="px-3 py-1.5 border-t border-zinc-800/50 flex items-center gap-4">
        <span className="text-[10px] text-zinc-600">Source</span>
        <span className="text-[10px] text-zinc-500 font-mono">{dispenser.source}</span>
        <span className="text-[10px] text-zinc-600 ml-auto">TX</span>
        <span className="text-[10px] text-zinc-500 font-mono">
          {dispenser.tx_hash.slice(0, 8)}…{dispenser.tx_hash.slice(-6)}
        </span>
      </div>
    </div>
  )
}
