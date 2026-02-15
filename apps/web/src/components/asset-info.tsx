import { formatAddress } from '@/utils/format-address'
import type { TradingPairData } from '@/lib/hooks/useTradingPair'

interface AssetInfoProps {
  pairData: TradingPairData
}

export function AssetInfo({ pairData }: AssetInfoProps) {
  const ai = pairData.asset_info

  return (
    <div className="p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Asset Info</h3>
      <div className="space-y-2">
        <div>
          <div className="text-xs text-zinc-600">Owner</div>
          <div className="text-xs text-zinc-400 font-mono truncate">
            {ai?.owner || ai?.issuer ? formatAddress((ai.owner || ai.issuer)!) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Issued</div>
          <div className="text-xs text-zinc-400 font-mono">
            {ai?.first_issuance_block_index ? `Block ${ai.first_issuance_block_index.toLocaleString()}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Description</div>
          <div className="text-xs text-zinc-400 leading-relaxed">
            {ai?.description || '—'}
          </div>
        </div>
        {ai?.asset_longname && (
          <div>
            <div className="text-xs text-zinc-600">Subasset of</div>
            <div className="text-xs text-zinc-400 font-mono">{ai.asset_longname}</div>
          </div>
        )}
      </div>
    </div>
  )
}
