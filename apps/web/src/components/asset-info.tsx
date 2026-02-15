import { formatAddress } from '@/utils/format-address'
import type { TradingPairDetail } from '@/types/trading'

interface AssetInfoProps {
  pairData: TradingPairDetail
}

export function AssetInfo({ pairData }: AssetInfoProps) {
  const baseAsset = pairData.base_asset

  return (
    <div className="p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Asset Info</h3>
      <div className="space-y-2">
        <div>
          <div className="text-xs text-zinc-600">Owner</div>
          <div className="text-xs text-zinc-400 font-mono truncate">
            {baseAsset?.issuer ? formatAddress(baseAsset.issuer) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Issued</div>
          <div className="text-xs text-zinc-400 font-mono">
            {baseAsset?.block_index ? `Block ${baseAsset.block_index.toLocaleString()}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Description</div>
          <div className="text-xs text-zinc-400 leading-relaxed">
            {baseAsset?.description || '—'}
          </div>
        </div>
        {baseAsset?.asset_longname && (
          <div>
            <div className="text-xs text-zinc-600">Subasset of</div>
            <div className="text-xs text-zinc-400 font-mono">{baseAsset.asset_longname}</div>
          </div>
        )}
      </div>
    </div>
  )
}
