import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import type { TradingPairData } from '@/lib/hooks/useTradingPair'

interface AssetInfoProps {
  pairData: TradingPairData
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function AssetInfo({ pairData }: AssetInfoProps) {
  const info = pairData.asset_info

  return (
    <div className="p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Asset Info</h3>
      <div className="space-y-2">
        <div>
          <div className="text-xs text-zinc-600">Owner</div>
          <div className="text-xs text-zinc-400 font-mono truncate">
            {info?.owner || info?.issuer ? formatAddress((info.owner || info.issuer)!) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Issued</div>
          <div className="text-xs text-zinc-400">
            {info?.first_issuance_block_time
              ? <>{formatDate(info.first_issuance_block_time)} <span className="text-zinc-600">({formatTimeAgo(info.first_issuance_block_time)})</span></>
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">Description</div>
          <div className="text-xs text-zinc-400 leading-relaxed">
            {info?.description || '—'}
          </div>
        </div>
        {info?.asset_longname && (
          <div>
            <div className="text-xs text-zinc-600">Subasset of</div>
            <div className="text-xs text-zinc-400 font-mono">{info.asset_longname}</div>
          </div>
        )}
      </div>
    </div>
  )
}
