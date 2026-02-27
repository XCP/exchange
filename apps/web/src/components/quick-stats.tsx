import type { TradingPairData } from '@/lib/hooks/useTradingPair'

interface QuickStatsProps {
  pairData: TradingPairData
  assetOnly?: boolean
}

export function QuickStats({ pairData, assetOnly }: QuickStatsProps) {
  const info = pairData.asset_info

  return (
    <div className="p-3 border-b border-zinc-800">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-xs text-zinc-600">Supply</div>
          <div className="text-xs text-zinc-300 font-mono">
            {info?.supply_normalized ? Number(info.supply_normalized).toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Holders</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.holders_count != null ? pairData.holders_count.toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Divisible</div>
          <div className="text-xs text-zinc-300 font-mono">
            {info ? (info.divisible ? 'Yes' : 'No') : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Locked</div>
          <div className={`text-xs font-medium ${info ? (info.locked ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-500'}`}>
            {info ? (info.locked ? 'Yes' : 'No') : '—'}
          </div>
        </div>
        {!assetOnly && (<>
        <div>
          <div className="text-xs text-zinc-600">Total Trades</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.total_trade_count != null ? pairData.total_trade_count.toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Unique Traders</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.unique_traders != null ? pairData.unique_traders.toLocaleString() : '—'}
          </div>
        </div>
        </>)}
      </div>
    </div>
  )
}
