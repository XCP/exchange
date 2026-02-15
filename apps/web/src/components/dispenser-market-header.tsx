import Image from 'next/image'
import { formatAmount } from '@/utils/format-amount'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { TradingPairDetail } from '@/types/trading'
import type { DispenserStats } from '@/lib/hooks/useDispenserStats'

interface DispenserMarketHeaderProps {
  pairData: TradingPairDetail | undefined
  stats: DispenserStats | undefined
  asset: string
  isLoading: boolean
  actionSlot?: React.ReactNode
}

export function DispenserMarketHeader({ pairData, stats, asset, isLoading, actionSlot }: DispenserMarketHeaderProps) {
  const market = `${asset}/BTC`
  const priceChange = stats?.price_change_24h
  const isPositive = priceChange != null && priceChange >= 0

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center">
            {pairData?.base_asset?.asset ? (
              <Image
                src={`${XCP_IMG_BASE}/icon/${pairData.base_asset.asset}`}
                alt={asset}
                width={32}
                height={32}
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xs font-bold text-green-400">
                {asset.slice(0, 2)}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">{market}</h1>
            <span className="text-xs text-zinc-500 max-sm:hidden">Dispensers</span>
          </div>
        </div>

        <div className="h-8 w-px bg-zinc-800 max-sm:hidden" />

        <div className="flex items-baseline gap-2">
          {isLoading ? (
            <span className="text-lg font-semibold text-zinc-500 font-mono">—</span>
          ) : (
            <>
              <span className="text-lg font-semibold text-zinc-100 font-mono max-sm:text-base">
                {stats?.last_dispense_price != null ? formatAmount(stats.last_dispense_price) : '—'}
              </span>
              <span className="text-xs text-zinc-500">BTC</span>
            </>
          )}
        </div>

        {priceChange != null && priceChange !== 0 && (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
            isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {isPositive ? '+' : ''}{priceChange.toFixed(1)}%
          </span>
        )}

        <div className="h-8 w-px bg-zinc-800 max-md:hidden" />

        <div className="hidden md:flex gap-5">
          <div>
            <div className="text-xs text-zinc-500">24h High</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats?.high_24h != null ? formatAmount(stats.high_24h) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">24h Low</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats?.low_24h != null ? formatAmount(stats.low_24h) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">24h Vol</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats?.volume_24h ? `${formatAmount(stats.volume_24h)} BTC` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Active</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats?.active_dispensers ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Available</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats?.total_available != null ? formatAmount(stats.total_available) : '—'}
            </div>
          </div>
        </div>

        {actionSlot && <div className="ml-auto">{actionSlot}</div>}
      </div>
    </div>
  )
}
