import { formatAmount } from '@/utils/format-amount'
import type { TradingPairData } from '@/lib/hooks/useTradingPair'

interface QuickStatsProps {
  pairData: TradingPairData
}

export function QuickStats({ pairData }: QuickStatsProps) {
  const ai = pairData.asset_info

  return (
    <div className="p-3 border-b border-zinc-800">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-xs text-zinc-600">Supply</div>
          <div className="text-xs text-zinc-300 font-mono">
            {ai?.supply != null ? formatAmount(ai.supply) : 'N/A'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Holders</div>
          <div className="text-xs text-zinc-300 font-mono">—</div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Divisible</div>
          <div className={`text-xs font-mono ${ai?.divisible ? 'text-green-400' : 'text-zinc-400'}`}>
            {ai ? (ai.divisible ? 'Yes' : 'No') : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Locked</div>
          <div className={`text-xs font-mono ${ai?.locked ? 'text-green-400' : 'text-zinc-400'}`}>
            {ai ? (ai.locked ? 'Yes' : 'No') : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">24h Vol</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.volume_24h != null ? `${formatAmount(pairData.volume_24h)} ${pairData.quote_asset}` : 'N/A'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">7d Vol</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.volume_7d != null ? `${formatAmount(pairData.volume_7d)} ${pairData.quote_asset}` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  )
}
