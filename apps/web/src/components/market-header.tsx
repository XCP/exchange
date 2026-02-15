'use client'

import { useState } from 'react'
import Image from 'next/image'
import { formatAmount } from '@/utils/format-amount'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { TradingPairData } from '@/lib/hooks/useTradingPair'

type Timeframe = '24h' | '7d' | '30d'

interface MarketHeaderProps {
  pairData: TradingPairData | undefined
  baseSymbol: string
  quoteSymbol: string
  market: string
  isLoading: boolean
  actionSlot?: React.ReactNode
}

function getStats(p: TradingPairData | undefined, tf: Timeframe) {
  if (!p) return { change: null, volume: null, high: null, low: null, count: null }
  if (tf === '7d') return { change: p.price_change_7d, volume: p.volume_7d, high: p.high_7d ?? null, low: p.low_7d ?? null, count: p.trade_count_7d }
  if (tf === '30d') return { change: p.price_change_30d ?? null, volume: p.volume_30d, high: p.high_30d ?? null, low: p.low_30d ?? null, count: p.trade_count_30d }
  return { change: p.price_change_24h, volume: p.volume_24h, high: p.high_24h, low: p.low_24h, count: p.trade_count_24h }
}

export function MarketHeader({ pairData, baseSymbol, quoteSymbol, market, isLoading, actionSlot }: MarketHeaderProps) {
  const [tf, setTf] = useState<Timeframe>('24h')
  const stats = getStats(pairData, tf)
  const isPositive = stats.change != null && stats.change >= 0

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 rounded-sm bg-zinc-800 overflow-hidden flex items-center justify-center">
            {pairData?.base_asset ? (
              <Image
                src={`${XCP_IMG_BASE}/icon/${pairData.base_asset}`}
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
                {pairData?.last_price != null ? formatAmount(pairData.last_price) : '—'}
              </span>
              <span className="text-xs text-zinc-500">{quoteSymbol}</span>
            </>
          )}
        </div>

        {stats.change != null && (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
            isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {isPositive ? '+' : ''}{stats.change.toFixed(1)}%
          </span>
        )}

        <div className="h-8 w-px bg-zinc-800 max-md:hidden" />

        <div className="hidden md:flex gap-5 items-end">
          <div>
            <div className="text-xs text-zinc-500">{tf} High</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats.high != null ? formatAmount(stats.high) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">{tf} Low</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats.low != null ? formatAmount(stats.low) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">{tf} Vol</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats.volume ? `${formatAmount(stats.volume)} ${quoteSymbol}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Trades</div>
            <div className="text-xs text-zinc-300 font-mono">
              {stats.count != null && stats.count > 0 ? stats.count : '—'}
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
