'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useGlobalOrders } from '@/lib/hooks/useGlobalOrders'
import { useGlobalTrades } from '@/lib/hooks/useGlobalTrades'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { getTradingDirection, getTradingPairSlug, getTradingPairString, calculatePrice, calculateAmount, assetsToTradingPairFromSymbols, getTradingPairSlugFromSymbols } from '@/utils/trading-pair'
import { XCP_IMG_BASE } from '@/utils/constants'
import { useTradeSummary } from '@/lib/hooks/useTradeSummary'
import { formatAmount } from '@/utils/format-amount'
import { usePairMarkets } from '@/lib/hooks/usePairMarkets'
import type { PairStats } from '@/lib/hooks/usePairStats'

type Tab = 'markets' | 'open' | 'matches'
type Timeframe = '24h' | '7d' | '30d' | 'all'

function pctColor(v: number | null) {
  if (v == null) return 'text-zinc-600'
  return v >= 0 ? 'text-green-400' : 'text-red-400'
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function fmtVol(v: number | null) {
  if (v == null || v <= 0) return '—'
  return formatAmount(v)
}

function tfVal(p: PairStats, prefix: string, tf: Timeframe): number | null {
  if (tf === 'all') return null
  const key = `${prefix}_${tf}` as keyof PairStats
  return (p[key] as number | null) ?? null
}

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('markets')
  const [timeframe, setTimeframe] = useState<Timeframe>('24h')
  const { orders, isLoading: ordersLoading } = useGlobalOrders(50)
  const { trades, isLoading: tradesLoading } = useGlobalTrades(50)
  const { data: summary } = useTradeSummary()
  const { pairs, isLoading: pairsLoading } = usePairMarkets('total_trade_count', timeframe)

  const rolling = timeframe !== 'all'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Orders</h1>
          <p className="text-xs text-zinc-500">DEX orders across all Counterparty markets</p>
        </div>

        {summary && (
          <div className="flex gap-6 mb-4 text-xs">
            <div>
              <span className="text-zinc-500">Trading Pairs</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.total_pairs.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">Active (24h)</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.active_pairs_24h.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">24h Volume</span>{' '}
              <span className="text-zinc-300 font-mono">{formatAmount(summary.volume_24h)} XCP</span>
            </div>
            <div>
              <span className="text-zinc-500">24h Trades</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.trades_24h.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">Total Trades</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.total_trades.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Tab bar + timeframe selector */}
        <div className="flex items-center gap-1 mb-4">
          {([
            ['markets', 'Markets'],
            ['open', 'Open Orders'],
            ['matches', 'Recent Matches'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                activeTab === tab
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
          {activeTab === 'markets' && (
            <div className="ml-auto flex gap-0.5">
              {(['24h', '7d', '30d', 'all'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 text-xs font-mono rounded-sm transition-colors ${
                    timeframe === tf
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {tf === 'all' ? 'All' : tf}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeTab === 'markets' && (
          <div className="border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="text-xs whitespace-nowrap">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left font-normal px-3 py-2.5 sticky left-0 bg-zinc-900/50 z-10">Pair</th>
                  <th className="text-right font-normal px-3 py-2.5">Last</th>
                  <th className="text-right font-normal px-3 py-2.5">Side</th>
                  {rolling ? (
                    <>
                      <th className="text-right font-normal px-3 py-2.5">{timeframe} %</th>
                      <th className="text-right font-normal px-3 py-2.5">{timeframe} Vol</th>
                      <th className="text-right font-normal px-3 py-2.5">{timeframe} High</th>
                      <th className="text-right font-normal px-3 py-2.5">{timeframe} Low</th>
                      <th className="text-right font-normal px-3 py-2.5">{timeframe} Trades</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right font-normal px-3 py-2.5">Total Vol</th>
                      <th className="text-right font-normal px-3 py-2.5">Total Trades</th>
                      <th className="text-right font-normal px-3 py-2.5">Traders</th>
                      <th className="text-right font-normal px-3 py-2.5">ATH</th>
                      <th className="text-right font-normal px-3 py-2.5">ATL</th>
                    </>
                  )}
                  <th className="text-right font-normal px-3 py-2.5">Orders</th>
                  <th className="text-right font-normal px-3 py-2.5">Bids</th>
                  <th className="text-right font-normal px-3 py-2.5">Asks</th>
                  <th className="text-right font-normal px-3 py-2.5">Best Bid</th>
                  <th className="text-right font-normal px-3 py-2.5">Best Ask</th>
                  <th className="text-right font-normal px-3 py-2.5">Spread</th>
                  <th className="text-right font-normal px-3 py-2.5">First Trade</th>
                </tr>
              </thead>
              <tbody>
                {pairsLoading ? (
                  <tr>
                    <td colSpan={20} className="text-center py-20 text-sm text-zinc-500">
                      Loading markets...
                    </td>
                  </tr>
                ) : pairs.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="text-center py-20 text-sm text-zinc-600">
                      No trading pairs found
                    </td>
                  </tr>
                ) : (
                  pairs.map((p) => (
                    <tr key={p.pair} className="hover:bg-zinc-900 transition-colors border-b border-zinc-800/50 last:border-0">
                      <td className="px-3 py-2 sticky left-0 bg-zinc-950 z-10">
                        <Link href={`/trade/${p.pair}`} className="flex items-center gap-2">
                          <Image
                            src={`${XCP_IMG_BASE}/icon/${p.base_asset}`}
                            alt=""
                            width={16}
                            height={16}
                            className="rounded-sm"
                            unoptimized
                          />
                          <span className="text-zinc-200 font-medium hover:underline">{p.pair.replace('_', '/')}</span>
                        </Link>
                      </td>
                      <td className="text-right text-zinc-300 font-mono px-3 py-2">{p.last_price != null ? formatPrice(p.last_price) : '—'}</td>
                      <td className={`text-right font-mono px-3 py-2 ${p.last_side === 'buy' ? 'text-green-400' : p.last_side === 'sell' ? 'text-red-400' : 'text-zinc-600'}`}>{p.last_side ?? '—'}</td>
                      {rolling ? (
                        <>
                          <td className={`text-right font-mono px-3 py-2 ${pctColor(tfVal(p, 'price_change', timeframe))}`}>{fmtPct(tfVal(p, 'price_change', timeframe))}</td>
                          <td className="text-right font-mono px-3 py-2">
                            <div className="text-zinc-400">{fmtVol(tfVal(p, 'volume', timeframe))}</div>
                            <div className="text-zinc-600 text-[10px]">{fmtVol(tfVal(p, 'base_volume', timeframe))}</div>
                          </td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{tfVal(p, 'high', timeframe) != null ? formatPrice(tfVal(p, 'high', timeframe)!) : '—'}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{tfVal(p, 'low', timeframe) != null ? formatPrice(tfVal(p, 'low', timeframe)!) : '—'}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{tfVal(p, 'trade_count', timeframe) ?? 0}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-right font-mono px-3 py-2">
                            <div className="text-zinc-400">{fmtVol(p.total_volume)}</div>
                            <div className="text-zinc-600 text-[10px]">{fmtVol(p.total_base_volume)}</div>
                          </td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.total_trade_count ?? 0}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.unique_traders ?? 0}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.all_time_high != null ? formatPrice(p.all_time_high) : '—'}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.all_time_low != null ? formatPrice(p.all_time_low) : '—'}</td>
                        </>
                      )}
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.open_orders ?? 0}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.bid_count ?? 0}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.ask_count ?? 0}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.best_bid != null ? formatPrice(p.best_bid) : '—'}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.best_ask != null ? formatPrice(p.best_ask) : '—'}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{p.spread != null ? formatPrice(p.spread) : '—'}</td>
                      <td className="text-right text-zinc-600 font-mono px-3 py-2">{p.first_trade_time ? formatTimeAgo(p.first_trade_time) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'open' && (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            <div className="grid grid-cols-7 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-4">
              <span>Pair</span>
              <span>Type</span>
              <span className="text-right">Price</span>
              <span className="text-right max-sm:hidden">Amount</span>
              <span className="text-right max-sm:hidden">Source</span>
              <span className="text-right max-sm:hidden">Expires</span>
              <span className="text-right">Time</span>
            </div>

            {ordersLoading ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-500">Loading orders...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-600">No open orders found</span>
              </div>
            ) : (
              <div>
                {orders.map((order) => {
                  const direction = getTradingDirection(order)
                  const pairSlug = getTradingPairSlug(order)
                  const pairString = getTradingPairString(order)
                  const price = calculatePrice(order)
                  const amount = calculateAmount(order)
                  const isBuy = direction === 'buy'

                  return (
                    <Link
                      key={order.tx_hash}
                      href={`/trade/${pairSlug}`}
                      className="grid grid-cols-7 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-4"
                    >
                      <span className="flex items-center gap-2">
                        <Image
                          src={`${XCP_IMG_BASE}/icon/${order.give_asset}`}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-sm"
                          unoptimized
                        />
                        <span className="text-zinc-200 font-medium truncate">{pairString}</span>
                      </span>
                      <span className={`font-mono font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                        {isBuy ? 'Buy' : 'Sell'}
                      </span>
                      <span className="text-right text-zinc-300 font-mono">{price}</span>
                      <span className="text-right text-zinc-400 font-mono max-sm:hidden">{amount}</span>
                      <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAddress(order.source)}</span>
                      <span className="text-right text-zinc-600 font-mono max-sm:hidden">
                        {order.expiration.toLocaleString()} blks
                      </span>
                      <span className="text-right text-zinc-600 font-mono">
                        {order.block_time ? formatTimeAgo(order.block_time) : '—'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'matches' && (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
              <span>Pair</span>
              <span className="text-right">Gave</span>
              <span className="text-right">Got</span>
              <span className="text-right max-sm:hidden">Maker</span>
              <span className="text-right max-sm:hidden">Taker</span>
              <span className="text-right max-sm:hidden">Time</span>
            </div>

            {tradesLoading ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-500">Loading matches...</span>
              </div>
            ) : trades.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-600">No recent matches found</span>
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
                        {formatPrice(trade.forward_quantity_normalized)} <span className="text-zinc-600">{fwdSymbol.length > 10 ? fwdSymbol.slice(0, 8) + '…' : fwdSymbol}</span>
                      </span>
                      <span className="text-right text-green-400 font-mono">
                        {formatPrice(trade.backward_quantity_normalized)} <span className="text-zinc-600">{bwdSymbol.length > 10 ? bwdSymbol.slice(0, 8) + '…' : bwdSymbol}</span>
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
        )}
      </div>
    </div>
  )
}
