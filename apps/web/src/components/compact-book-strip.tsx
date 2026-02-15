import type { OrderBookEntry } from '@/types/trading'

interface CompactBookStripProps {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread: string
  spreadPct: string
  onRowClick?: (entry: OrderBookEntry, side: 'buy' | 'sell') => void
}

/** Height for 5 rows: ~18px per row = 90px */
const ROW_HEIGHT = 90

export function CompactBookStrip({ bids, asks, spread, spreadPct, onRowClick }: CompactBookStripProps) {
  // Cumulative totals for depth bars
  const bidCumulative = bids.reduce<number[]>((acc, bid, i) => {
    const val = parseFloat(bid.total.replace(/,/g, ''))
    acc.push(i === 0 ? val : acc[i - 1] + val)
    return acc
  }, [])
  const askCumulative = asks.reduce<number[]>((acc, ask, i) => {
    const val = parseFloat(ask.total.replace(/,/g, ''))
    acc.push(i === 0 ? val : acc[i - 1] + val)
    return acc
  }, [])
  const maxBidCum = bidCumulative.length > 0 ? bidCumulative[bidCumulative.length - 1] : 1
  const maxAskCum = askCumulative.length > 0 ? askCumulative[askCumulative.length - 1] : 1

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/50">
        <span className="text-xs text-zinc-500">Order Book</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-zinc-400">Spread: {spread}</span>
          <span className="text-[11px] text-zinc-600">({spreadPct}%)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-zinc-800">
        {/* Bids (left) — highest first, bars grow from right */}
        <div>
          <div className="grid grid-cols-3 gap-0 px-3 py-1 text-[10px] text-zinc-600">
            <span>Price</span>
            <span className="text-right">Amt</span>
            <span className="text-right">Total</span>
          </div>
          <div className="px-0.5 overflow-y-auto" style={{ height: `${ROW_HEIGHT}px` }}>
            {bids.length > 0 ? (
              bids.map((bid, i) => {
                const depthPct = (bidCumulative[i] / maxBidCum) * 100
                return (
                  <div
                    key={`strip-bid-${i}`}
                    className="relative grid grid-cols-3 gap-0 px-2 py-px hover:bg-zinc-900 cursor-pointer"
                    onClick={() => onRowClick?.(bid, 'sell')}
                  >
                    <div
                      className="absolute inset-y-0 right-0 bg-green-500/10"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="relative z-10 text-green-400 font-mono text-[11px]">{bid.price}</span>
                    <span className="relative z-10 text-right text-zinc-400 font-mono text-[11px]">{bid.amount}</span>
                    <span className="relative z-10 text-right text-zinc-500 font-mono text-[11px]">{bid.total}</span>
                  </div>
                )
              })
            ) : (
              <div className="px-2 py-2 text-[11px] text-zinc-600 text-center">No bids</div>
            )}
          </div>
        </div>

        {/* Asks (right) — lowest first, bars grow from left */}
        <div>
          <div className="grid grid-cols-3 gap-0 px-3 py-1 text-[10px] text-zinc-600">
            <span>Price</span>
            <span className="text-right">Amt</span>
            <span className="text-right">Total</span>
          </div>
          <div className="px-0.5 overflow-y-auto" style={{ height: `${ROW_HEIGHT}px` }}>
            {asks.length > 0 ? (
              asks.map((ask, i) => {
                const depthPct = (askCumulative[i] / maxAskCum) * 100
                return (
                  <div
                    key={`strip-ask-${i}`}
                    className="relative grid grid-cols-3 gap-0 px-2 py-px hover:bg-zinc-900 cursor-pointer"
                    onClick={() => onRowClick?.(ask, 'buy')}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-red-500/10"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="relative z-10 text-red-400 font-mono text-[11px]">{ask.price}</span>
                    <span className="relative z-10 text-right text-zinc-400 font-mono text-[11px]">{ask.amount}</span>
                    <span className="relative z-10 text-right text-zinc-500 font-mono text-[11px]">{ask.total}</span>
                  </div>
                )
              })
            ) : (
              <div className="px-2 py-2 text-[11px] text-zinc-600 text-center">No asks</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
