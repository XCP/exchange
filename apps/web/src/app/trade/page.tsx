'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { RiFilter3Line } from 'react-icons/ri'
import { useBlockHeight } from '@/lib/hooks/useNetworkInfo'
import { useLatestOrders, type OrderTab, type LatestOrder } from '@/lib/hooks/useLatestOrders'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

function compactTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

function EmptyRows({ loading, label, cols }: { loading: boolean; label: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-10 text-zinc-600 text-xs">
        {loading ? `Loading ${label}...` : `No recent ${label}`}
      </td>
    </tr>
  )
}

const ORDER_TABS: [OrderTab, string][] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['filled', 'Filled'],
  ['expiring', 'Expiring'],
  ['expired', 'Expired'],
  ['cancelled', 'Cancelled'],
]

export default function TradePage() {
  const [tab, setTab] = useState<OrderTab>('open')
  const [baseSearch, setBaseSearch] = useState('')
  const [quoteSearch, setQuoteSearch] = useState('')
  const [debouncedBase, setDebouncedBase] = useState('')
  const [debouncedQuote, setDebouncedQuote] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const blockHeight = useBlockHeight()

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBase(baseSearch), 300)
    return () => clearTimeout(timer)
  }, [baseSearch])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuote(quoteSearch), 300)
    return () => clearTimeout(timer)
  }, [quoteSearch])

  const filters = {
    ...(debouncedBase ? { baseAsset: debouncedBase } : {}),
    ...(debouncedQuote ? { quoteAsset: debouncedQuote } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
  }

  const { orders, isLoading } = useLatestOrders(tab, Object.keys(filters).length > 0 ? filters : undefined)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-zinc-500">DEX Orders</span>
            {sourceFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 ml-2">
                {formatAddress(sourceFilter)}
                <button onClick={() => setSourceFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
              </span>
            )}
            <div className="flex gap-0.5 ml-auto">
              {ORDER_TABS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                    tab === key
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <OrdersTable orders={orders} isLoading={isLoading} blockHeight={blockHeight} baseSearch={baseSearch} quoteSearch={quoteSearch} onBaseSearch={setBaseSearch} onQuoteSearch={setQuoteSearch} onFilterAddress={setSourceFilter} />
        </div>
      </div>
    </div>
  )
}

function OrdersTable({ orders, isLoading, blockHeight, baseSearch, quoteSearch, onBaseSearch, onQuoteSearch, onFilterAddress }: {
  orders: LatestOrder[]
  isLoading: boolean
  blockHeight: number | null
  baseSearch: string
  quoteSearch: string
  onBaseSearch: (v: string) => void
  onQuoteSearch: (v: string) => void
  onFilterAddress: (addr: string) => void
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-2 py-1.5 w-10">Side</th>
          <th className="text-right font-normal px-2 py-1.5">Amount</th>
          <th className="text-left font-normal px-2 py-0.5">
            <input
              type="text"
              value={baseSearch}
              onChange={(e) => onBaseSearch(e.target.value)}
              placeholder="Asset"
              className="w-full px-1.5 py-0.5 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
            />
          </th>
          <th className="text-right font-normal px-2 py-1.5">Price</th>
          <th className="text-left font-normal px-2 py-0.5">
            <input
              type="text"
              value={quoteSearch}
              onChange={(e) => onQuoteSearch(e.target.value)}
              placeholder="Quote"
              className="w-full px-1.5 py-0.5 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
            />
          </th>
          <th className="text-left font-normal px-2 py-1.5 max-sm:hidden">Address</th>
          <th className="text-left font-normal px-2 py-1.5 max-sm:hidden">Status</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Expires</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || orders.length === 0 ? (
          <EmptyRows loading={isLoading} label="orders" cols={9} />
        ) : (
          orders.map((order) => {
            const [base, quote] = order.pair.split('_')
            const isClosed = order.status !== 'open'

            return (
              <tr key={order.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-600 font-mono px-2 py-px">
                  {order.block_time ? compactTime(order.block_time) : '—'}
                </td>
                <td className={`font-medium px-2 py-px ${/^(buy|bid)$/i.test(order.side) ? 'text-green-400' : 'text-red-400'}`}>
                  {/^(buy|bid)$/i.test(order.side) ? 'Buy' : 'Sell'}
                </td>
                <td className="text-right text-zinc-400 font-mono px-2 py-px">
                  {formatPrice(order.amount)}
                </td>
                <td className="px-2 py-px">
                  <Link href={`/trade/${order.pair}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${order.base_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{base}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-2 py-px">
                  {isFinite(order.price) ? formatPrice(order.price) : '—'}
                </td>
                <td className="px-2 py-px">
                  <Link href={`/trade/${order.pair}`} className="flex items-center gap-1.5 hover:underline decoration-zinc-400">
                    <Image src={`${XCP_IMG_BASE}/icon/${order.quote_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-400 truncate">{quote}</span>
                  </Link>
                </td>
                <td className="text-left font-mono px-2 py-px max-sm:hidden">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-zinc-600">{formatAddress(order.source)}</span>
                    <button
                      onClick={() => onFilterAddress(order.source)}
                      className="text-zinc-700 hover:text-zinc-400 transition-colors"
                      title="Filter by this address"
                    >
                      <RiFilter3Line className="w-3 h-3" />
                    </button>
                  </span>
                </td>
                <td className={`text-left font-mono px-2 py-px max-sm:hidden capitalize ${isClosed ? 'text-zinc-700' : 'text-zinc-500'}`}>
                  {order.status}
                </td>
                <td className="text-right text-zinc-600 font-mono px-2 py-px max-sm:hidden">
                  {blockHeight != null ? `${Math.max(0, order.expire_index - blockHeight).toLocaleString()} blks` : '—'}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
