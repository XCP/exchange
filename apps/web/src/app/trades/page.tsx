'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useGlobalTrades } from '@/lib/hooks/useGlobalTrades'
import { formatAddress } from '@/utils/format-address'
import { formatAmountTrade } from '@/utils/format-amount-trade'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { assetsToTradingPairFromSymbols, getTradingPairSlugFromSymbols } from '@/utils/trading-pair'
import { XCP_IMG_BASE } from '@/utils/constants'

export default function TradesPage() {
  const { trades, isLoading } = useGlobalTrades(50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Recent Trades</h1>
          <p className="text-xs text-zinc-500">Completed order matches across all DEX markets</p>
        </div>

        <div className="border border-zinc-800 rounded-sm overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
            <span>Pair</span>
            <span className="text-right">Gave</span>
            <span className="text-right">Got</span>
            <span className="text-right max-sm:hidden">Maker</span>
            <span className="text-right max-sm:hidden">Taker</span>
            <span className="text-right max-sm:hidden">Time</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="text-sm text-zinc-500">Loading trades...</span>
            </div>
          ) : trades.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <span className="text-sm text-zinc-600">No recent trades found</span>
            </div>
          ) : (
            <div>
              {trades.map((trade) => {
                const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
                const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
                const [base, quote] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
                const pairSlug = getTradingPairSlugFromSymbols(fwdSymbol, bwdSymbol)
                const pairLabel = `${base}/${quote}`

                return (
                  <Link
                    key={trade.id}
                    href={`/trade/${pairSlug}`}
                    className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
                  >
                    <span className="flex items-center gap-2">
                      <Image
                        src={`${XCP_IMG_BASE}/icon/${trade.forward_asset}`}
                        alt=""
                        width={16}
                        height={16}
                        className="rounded-sm"
                        unoptimized
                      />
                      <span className="text-zinc-200 font-medium truncate">{pairLabel}</span>
                    </span>
                    <span className="text-right text-red-400 font-mono">
                      {formatAmountTrade(trade.forward_quantity_normalized)} <span className="text-zinc-600">{fwdSymbol.length > 10 ? fwdSymbol.slice(0, 8) + '…' : fwdSymbol}</span>
                    </span>
                    <span className="text-right text-green-400 font-mono">
                      {formatAmountTrade(trade.backward_quantity_normalized)} <span className="text-zinc-600">{bwdSymbol.length > 10 ? bwdSymbol.slice(0, 8) + '…' : bwdSymbol}</span>
                    </span>
                    <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                      {formatAddress(trade.tx0_address)}
                    </span>
                    <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                      {formatAddress(trade.tx1_address)}
                    </span>
                    <span className="text-right text-zinc-600 font-mono max-sm:hidden">
                      {trade.block_time ? formatTimeAgo(trade.block_time) : '—'}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
