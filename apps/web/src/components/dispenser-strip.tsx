import { formatAddress } from '@/utils/format-address'
import type { Dispenser } from '@/types/trading'

interface DispenserStripProps {
  dispensers: Dispenser[]
  isLoading: boolean
  selectedIndex: number
  onSelectIndex: (i: number) => void
}

export function DispenserStrip({ dispensers, isLoading, selectedIndex, onSelectIndex }: DispenserStripProps) {
  const maxRemaining = dispensers.length > 0
    ? Math.max(...dispensers.map(d => d.give_remaining))
    : 1

  return (
    <div className="border-y border-zinc-800">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/50 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">Dispensers</span>
        <span className="text-[11px] font-mono text-zinc-400">
          {isLoading ? '...' : `${dispensers.length} open`}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 gap-0 px-3 py-1 text-[10px] text-zinc-600 border-b border-zinc-800/50">
        <span>BTC Price</span>
        <span className="text-right">Per Dispense</span>
        <span className="text-right">Remaining</span>
        <span className="text-right">Source</span>
      </div>

      {/* Rows */}
      <div className="px-0.5">
        {isLoading ? (
          <div className="px-2 py-3 text-[11px] text-zinc-600 text-center">Loading...</div>
        ) : dispensers.length > 0 ? (
          dispensers.map((d, i) => {
            const depthPct = (d.give_remaining / maxRemaining) * 100
            const isSelected = i === selectedIndex
            return (
              <div
                key={d.tx_hash}
                className={`relative grid grid-cols-4 gap-0 px-2 py-px cursor-pointer ${
                  isSelected ? 'bg-green-500/15' : 'hover:bg-zinc-900'
                }`}
                onClick={() => onSelectIndex(i)}
              >
                <div
                  className="absolute inset-y-0 right-0 bg-green-500/10"
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
          })
        ) : (
          <div className="px-2 py-3 text-[11px] text-zinc-600 text-center">No open dispensers</div>
        )}
      </div>
    </div>
  )
}
