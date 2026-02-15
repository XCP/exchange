import Image from 'next/image'
import { formatAmount } from '@/utils/format-amount'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { TradingPairDetail } from '@/types/trading'

interface MarketHeaderProps {
  pairData: TradingPairDetail | undefined
  baseSymbol: string
  quoteSymbol: string
  market: string
  isLoading: boolean
  actionSlot?: React.ReactNode
}

export function MarketHeader({ pairData, baseSymbol, quoteSymbol, market, isLoading, actionSlot }: MarketHeaderProps) {
  const priceChange = pairData?.price_change_24h
  const isPositive = priceChange != null && priceChange >= 0

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center">
            {pairData?.base_asset?.asset ? (
              <Image
                src={`${XCP_IMG_BASE}/icon/${pairData.base_asset.asset}`}
                alt={baseSymbol}
                width={32}
                height={32}
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xs font-bold text-green-400">
                {baseSymbol.slice(0, 2)}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">{market}</h1>
            <span className="text-xs text-zinc-500 max-sm:hidden">Counterparty DEX</span>
          </div>
        </div>

        <div className="h-8 w-px bg-zinc-800 max-sm:hidden" />

        <div className="flex items-baseline gap-2">
          {isLoading ? (
            <span className="text-lg font-semibold text-zinc-500 font-mono">—</span>
          ) : (
            <>
              <span className="text-lg font-semibold text-zinc-100 font-mono max-sm:text-base">
                {pairData?.last_trade_price != null ? formatAmount(pairData.last_trade_price) : '—'}
              </span>
              <span className="text-xs text-zinc-500">{quoteSymbol}</span>
              {pairData?.last_trade_price_usd != null && (
                <span className="text-xs text-zinc-400 max-sm:hidden">
                  (${formatAmount(pairData.last_trade_price_usd, true)})
                </span>
              )}
            </>
          )}
        </div>

        {priceChange != null && (
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
              {pairData?.high_24h != null ? formatAmount(pairData.high_24h) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">24h Low</div>
            <div className="text-xs text-zinc-300 font-mono">
              {pairData?.low_24h != null ? formatAmount(pairData.low_24h) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">24h Vol</div>
            <div className="text-xs text-zinc-300 font-mono">
              {pairData?.volume_24h ? `${formatAmount(pairData.volume_24h)} ${quoteSymbol}` : '—'}
            </div>
          </div>
        </div>

        {actionSlot && <div className="ml-auto">{actionSlot}</div>}
      </div>
    </div>
  )
}
