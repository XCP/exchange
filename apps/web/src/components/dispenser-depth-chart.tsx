'use client'

import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { useSatsMode } from '@/lib/sats-context'
import type { Dispenser } from '@/types/trading'

interface PriceLevel {
  price: number
  priceLabel: string
  dispensers: Dispenser[]
  totalRemaining: number
  /** Indices into the parent sortedDispensers array */
  indices: number[]
}

interface DispenserDepthChartProps {
  dispensers: Dispenser[]
  isLoading: boolean
  selectedIndex: number
  onSelectIndex: (i: number) => void
  /** Only called when multiple dispensers at a price — single-dispenser levels show inline */
  onDispenserClick: (dispenser: Dispenser) => void
}

export function DispenserDepthChart({
  dispensers,
  isLoading,
  selectedIndex,
  onSelectIndex,
  onDispenserClick,
}: DispenserDepthChartProps) {
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const levels = (() => {
    const map = new Map<number, PriceLevel>()
    dispensers.forEach((d, i) => {
      const existing = map.get(d.satoshi_price)
      if (existing) {
        existing.dispensers.push(d)
        existing.totalRemaining += d.give_remaining
        existing.indices.push(i)
      } else {
        map.set(d.satoshi_price, {
          price: d.satoshi_price,
          priceLabel: d.satoshi_price_normalized,
          dispensers: [d],
          totalRemaining: d.give_remaining,
          indices: [i],
        })
      }
    })
    return Array.from(map.values())
  })()

  const maxRemaining = levels.length > 0 ? Math.max(...levels.map(l => l.totalRemaining)) : 1

  // Which price level is selected (derived from selectedIndex)
  const selectedPrice = dispensers[selectedIndex]?.satoshi_price ?? null
  const selectedLevel = levels.find(l => l.price === selectedPrice) ?? null
  const singleDispenser = selectedLevel?.dispensers.length === 1 ? selectedLevel.dispensers[0] : null

  if (isLoading) {
    return (
      <div className="border-b border-zinc-800 flex items-center justify-center" style={{ minHeight: '300px' }}>
        <span className="text-sm text-zinc-500">Loading dispensers...</span>
      </div>
    )
  }

  if (dispensers.length === 0) {
    return (
      <div className="border-b border-zinc-800 flex items-center justify-center" style={{ minHeight: '300px' }}>
        <span className="text-sm text-zinc-500">No open dispensers</span>
      </div>
    )
  }

  // Min 48px per bar, so many price levels scroll horizontally
  const barMinWidth = 48
  const chartInnerWidth = levels.length * (barMinWidth + 4)

  return (
    <div className="border-b border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/50 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">Sell Depth</span>
        <div className="flex items-center gap-3">
          {selectedLevel && (
            <span className="text-[11px] font-mono text-green-400">
              {formatPrice(parseFloat(selectedLevel.priceLabel), satsMode)} {btcLabel} — {selectedLevel.dispensers.length} dispenser{selectedLevel.dispensers.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[11px] font-mono text-zinc-500">
            {dispensers.length} total
          </span>
        </div>
      </div>

      {/* Vertical bar chart — scrollable horizontally */}
      <div className="overflow-x-auto px-3 pt-3 pb-1">
        <div
          className="flex items-end gap-1"
          style={{ height: '240px', minWidth: `${chartInnerWidth}px` }}
        >
          {levels.map((level) => {
            const heightPct = (level.totalRemaining / maxRemaining) * 100
            const isSelected = level.price === selectedPrice

            return (
              <div
                key={level.price}
                className="relative flex flex-col items-center justify-end h-full cursor-pointer"
                style={{ minWidth: `${barMinWidth}px`, flex: '1 1 0' }}
                onClick={() => onSelectIndex(level.indices[0])}
              >
                {/* Count badge */}
                {level.dispensers.length > 1 && (
                  <span className="text-[9px] text-zinc-500 mb-0.5">{level.dispensers.length}</span>
                )}

                {/* Bar */}
                <div
                  className={`w-full rounded-t-sm transition-colors ${
                    isSelected
                      ? 'bg-green-500/50 border-x border-t border-green-500/60'
                      : 'bg-green-500/20 hover:bg-green-500/30'
                  }`}
                  style={{ height: `${Math.max(heightPct, 3)}%`, minHeight: '2px' }}
                />

                {/* Price label under bar */}
                <span className={`mt-1 text-[9px] font-mono whitespace-nowrap ${
                  isSelected ? 'text-green-400' : 'text-zinc-500'
                }`}>
                  {formatAmount(level.priceLabel)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Below bars: detail for selected price level */}
      {selectedLevel && (
        <div className="border-t border-zinc-800">
          {singleDispenser ? (
            /* Single dispenser — show detail inline */
            <SingleDispenserDetail dispenser={singleDispenser} satsMode={satsMode} btcLabel={btcLabel} />
          ) : (
            /* Multiple dispensers — show list, click opens modal */
            <>
              <div className="grid grid-cols-4 gap-0 px-3 py-1 text-[10px] text-zinc-500 border-b border-zinc-800/50">
                <span>{btcLabel.toUpperCase()} Price</span>
                <span className="text-right">Per Dispense</span>
                <span className="text-right">Remaining</span>
                <span className="text-right">Source</span>
              </div>
              <div className="px-0.5 max-h-[100px] overflow-y-auto">
                {selectedLevel.dispensers.map((d, i) => {
                  const idx = selectedLevel.indices[i]
                  const isActive = idx === selectedIndex
                  const maxInLevel = Math.max(...selectedLevel.dispensers.map(x => x.give_remaining))
                  const depthPct = (d.give_remaining / maxInLevel) * 100

                  return (
                    <div
                      key={d.tx_hash}
                      className={`relative grid grid-cols-4 gap-0 px-2 py-px cursor-pointer ${
                        isActive ? 'bg-green-500/15' : 'hover:bg-zinc-900'
                      }`}
                      onClick={() => {
                        onSelectIndex(idx)
                        onDispenserClick(d)
                      }}
                    >
                      <div
                        className="absolute inset-y-0 right-0 bg-green-500/8"
                        style={{ width: `${depthPct}%` }}
                      />
                      <span className="relative z-10 text-green-400 font-mono text-[11px]">
                        {d.satoshi_price_normalized}
                      </span>
                      <span className="relative z-10 text-right text-zinc-400 font-mono text-[11px]">
                        {d.give_quantity_normalized}
                      </span>
                      <span className="relative z-10 text-right text-zinc-400 font-mono text-[11px]">
                        {d.give_remaining_normalized}
                      </span>
                      <span className="relative z-10 text-right text-zinc-500 font-mono text-[11px]">
                        {formatAddress(d.source)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact inline detail for a single dispenser at a price level */
function SingleDispenserDetail({ dispenser, satsMode, btcLabel }: { dispenser: Dispenser; satsMode: boolean; btcLabel: string }) {
  const remainingPct = dispenser.escrow_quantity > 0
    ? (dispenser.give_remaining / dispenser.escrow_quantity) * 100
    : 0

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      {/* Stats row */}
      <div className="flex items-center gap-6 text-[11px]">
        <div>
          <span className="text-zinc-500 mr-1.5">Per Dispense</span>
          <span className="text-zinc-300 font-mono">{formatPrice(parseFloat(dispenser.satoshi_price_normalized), satsMode)} {btcLabel}</span>
        </div>
        <div>
          <span className="text-zinc-500 mr-1.5">Tokens</span>
          <span className="text-zinc-300 font-mono">{formatAmount(dispenser.give_quantity_normalized)}</span>
        </div>
        <div>
          <span className="text-zinc-500 mr-1.5">Dispensed</span>
          <span className="text-zinc-300 font-mono">{dispenser.dispense_count}&times;</span>
        </div>
        {dispenser.block_time && (
          <div>
            <span className="text-zinc-500 mr-1.5">Created</span>
            <span className="text-zinc-300 font-mono">{formatTimeAgo(dispenser.block_time)}</span>
          </div>
        )}
        <div className="ml-auto">
          <span className="text-zinc-500 mr-1.5">Source</span>
          <span className="text-zinc-500 font-mono">{formatAddress(dispenser.source)}</span>
        </div>
      </div>

      {/* Supply bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 bg-zinc-800 rounded-sm overflow-hidden">
          <div
            className="h-full bg-green-500/60 rounded-sm"
            style={{ width: `${remainingPct}%` }}
          />
        </div>
        <span className="text-[10px] text-zinc-500 font-mono shrink-0">
          {formatAmount(dispenser.give_remaining_normalized)} / {formatAmount(dispenser.escrow_quantity_normalized)}
        </span>
      </div>
    </div>
  )
}
