import { formatAmount } from '@/utils/format-amount'
import type { TradingPairDetail } from '@/types/trading'

interface QuickStatsProps {
  pairData: TradingPairDetail
}

export function QuickStats({ pairData }: QuickStatsProps) {
  return (
    <div className="p-3 border-b border-zinc-800">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-xs text-zinc-600">Market Cap</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.market_cap_usd ? `$${formatAmount(pairData.market_cap_usd, true)}` : 'N/A'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Holders</div>
          <div className="text-xs text-zinc-300 font-mono">—</div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Supply</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.base_asset?.supply ? formatAmount(pairData.base_asset.supply) : 'N/A'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Divisible</div>
          <div className={`text-xs font-mono ${pairData.base_asset?.divisible ? 'text-green-400' : 'text-zinc-400'}`}>
            {pairData.base_asset?.divisible ? 'Yes' : 'No'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Locked</div>
          <div className={`text-xs font-mono ${pairData.base_asset?.locked ? 'text-green-400' : 'text-zinc-400'}`}>
            {pairData.base_asset?.locked ? 'Yes' : 'No'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">7d Vol</div>
          <div className="text-xs text-zinc-300 font-mono">
            {pairData.volume_7d ? `${formatAmount(pairData.volume_7d)} ${pairData.quote_asset?.symbol}` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  )
}
