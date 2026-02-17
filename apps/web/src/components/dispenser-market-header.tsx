'use client'

import { useState } from 'react'
import Image from 'next/image'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { useSatsMode } from '@/lib/sats-context'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { TradingPairData } from '@/lib/hooks/useTradingPair'
import type { DispenserStats } from '@/lib/hooks/useDispenserStats'

type Timeframe = '24h' | '7d' | '30d'

interface DispenserMarketHeaderProps {
  pairData: TradingPairData | undefined
  stats: DispenserStats | undefined
  asset: string
  isLoading: boolean
  actionSlot?: React.ReactNode
}

function getStats(s: DispenserStats | undefined, tf: Timeframe) {
  if (!s) return { change: null, volume: null, high: null, low: null, count: null }
  if (tf === '7d') return { change: s.price_change_7d, volume: s.volume_7d, high: s.high_7d ?? null, low: s.low_7d ?? null, count: s.dispense_count_7d }
  if (tf === '30d') return { change: s.price_change_30d ?? null, volume: s.volume_30d, high: s.high_30d ?? null, low: s.low_30d ?? null, count: s.dispense_count_30d }
  return { change: s.price_change_24h, volume: s.volume_24h, high: s.high_24h, low: s.low_24h, count: s.dispense_count_24h }
}

export function DispenserMarketHeader({ pairData, stats, asset, isLoading, actionSlot }: DispenserMarketHeaderProps) {
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const market = `${asset}/${btcLabel.toUpperCase()}`
  const [tf, setTf] = useState<Timeframe>('24h')
  const tfStats = getStats(stats, tf)
  const isPositive = tfStats.change != null && tfStats.change >= 0

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center">
            {pairData?.base_asset ? (
              <Image
                src={`${XCP_IMG_BASE}/icon/${pairData.base_asset}`}
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
                {stats?.last_dispense_price != null ? formatPrice(stats.last_dispense_price, satsMode) : '—'}
              </span>
              <span className="text-xs text-zinc-500">{btcLabel}</span>
            </>
          )}
        </div>

        {tfStats.change != null && tfStats.change !== 0 && (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
            isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {isPositive ? '+' : ''}{tfStats.change.toFixed(1)}%
          </span>
        )}

        <div className="h-8 w-px bg-zinc-800 max-md:hidden" />

        <div className="hidden md:flex gap-5 items-end">
          <div>
            <div className="text-xs text-zinc-500">{tf} High</div>
            <div className="text-xs text-zinc-300 font-mono">
              {tfStats.high != null ? formatPrice(tfStats.high, satsMode) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">{tf} Low</div>
            <div className="text-xs text-zinc-300 font-mono">
              {tfStats.low != null ? formatPrice(tfStats.low, satsMode) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">{tf} Vol</div>
            <div className="text-xs text-zinc-300 font-mono">
              {tfStats.volume ? `${formatPrice(tfStats.volume, satsMode)} ${btcLabel}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Dispenses</div>
            <div className="text-xs text-zinc-300 font-mono">
              {tfStats.count != null && tfStats.count > 0 ? tfStats.count : '—'}
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

        {/* Timeframe selector */}
        <div className="flex rounded-sm overflow-hidden border border-zinc-800 ml-auto md:ml-0">
          {(['24h', '7d', '30d'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                tf === t
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {actionSlot && <div className="ml-auto">{actionSlot}</div>}
      </div>
    </div>
  )
}
