'use client'

import { useEffect } from 'react'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatAmount } from '@/utils/format-amount'
import { formatAddress } from '@/utils/format-address'
import { usePendingDispenses } from '@/lib/hooks/usePendingDispenses'
import type { Dispenser } from '@/types/trading'

interface DispenserModalProps {
  dispenser: Dispenser
  asset: string
  onClose: () => void
}

export function DispenserModal({ dispenser, asset, onClose }: DispenserModalProps) {
  const { pendingCount } = usePendingDispenses(dispenser.source)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const remainingPct = dispenser.escrow_quantity > 0
    ? (dispenser.give_remaining / dispenser.escrow_quantity) * 100
    : 0
  const dispensedPct = 100 - remainingPct

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 rounded-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
          <span className="text-xs font-medium text-zinc-300">Dispenser Detail</span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Pending dispenses warning */}
        {pendingCount > 0 && (
          <div className="px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2">
            <span className="text-xs text-yellow-400">
              {pendingCount} pending dispense{pendingCount > 1 ? 's' : ''} in mempool
            </span>
          </div>
        )}

        {/* Content */}
        <div className="px-4 py-4">
          {/* Price hero */}
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-2xl font-semibold text-green-400 font-mono">
              {formatAmount(dispenser.price_normalized)}
            </span>
            <span className="text-xs text-zinc-500">BTC / {asset}</span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
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
              <div className="text-sm text-zinc-200 font-mono">{dispenser.dispense_count}&times;</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Created</div>
              <div className="text-sm text-zinc-200 font-mono">
                {dispenser.block_time ? formatTimeAgo(dispenser.block_time) : '—'}
              </div>
            </div>
          </div>

          {/* Supply bar */}
          <div className="mb-4">
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

          {/* Source + TX */}
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 w-10">Source</span>
              <span className="text-zinc-400 font-mono truncate">{dispenser.source}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 w-10">TX</span>
              <span className="text-zinc-400 font-mono truncate">{dispenser.tx_hash}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
