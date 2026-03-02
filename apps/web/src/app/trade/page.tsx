'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { RiFilter3Line, RiCloseLine } from 'react-icons/ri'
import { useBlockHeight } from '@/lib/hooks/useNetworkInfo'
import { useLatestOrders, type OrderTab, type LatestOrder } from '@/lib/hooks/useLatestOrders'
import { useAnalyticsSummary, type Timeframe } from '@/lib/hooks/useAnalytics'
import { useTags } from '@/lib/hooks/useTags'
import { Pagination } from '@/components/Pagination'
import { CounterCard } from '@/components/home/counter-card'
import { TogglePills } from '@/components/home/toggle-pills'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { formatBig } from '@/utils/format-analytics'
import { XCP_IMG_BASE } from '@/utils/constants'

function compactTime(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

function EmptyRows({ loading, label, cols }: { loading: boolean; label: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-10 text-zinc-500 text-xs">
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
  return <Suspense><TradePageInner /></Suspense>
}

const TF_OPTIONS = ['24h', '7d', '30d', 'all'] as const
const TF_LABELS: Record<Timeframe, string> = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All' }

function TradePageInner() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<OrderTab>('open')
  const [baseSearch, setBaseSearch] = useState('')
  const [quoteSearch, setQuoteSearch] = useState('')
  const [debouncedBase, setDebouncedBase] = useState('')
  const [debouncedQuote, setDebouncedQuote] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [sideFilter, setSideFilter] = useState<'buy' | 'sell' | null>(null)
  const [sortCol, setSortCol] = useState<'price:asc' | 'price:desc' | null>(null)
  const [tag, setTag] = useState<string | null>(() => searchParams.get('v'))
  const [timeframe, setTimeframe] = useState<Timeframe>('all')
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const includeHidden = !hideLowQuality

  const handleTagChange = useCallback((slug: string | null) => {
    setTag(slug)
    const url = new URL(window.location.href)
    if (slug) url.searchParams.set('v', slug)
    else url.searchParams.delete('v')
    window.history.replaceState(null, '', url.toString())
  }, [])
  const [offset, setOffset] = useState(0)
  const collections = useTags('collection')
  const blockHeight = useBlockHeight()

  const { tradeSummary, isLoading: summaryLoading } = useAnalyticsSummary(timeframe, includeHidden)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBase(baseSearch), 300)
    return () => clearTimeout(timer)
  }, [baseSearch])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuote(quoteSearch), 300)
    return () => clearTimeout(timer)
  }, [quoteSearch])

  useEffect(() => {
    setOffset(0)
  }, [tab, tag, debouncedBase, debouncedQuote, sourceFilter, sideFilter, sortCol])

  const filters = {
    ...(tag ? { tag } : {}),
    ...(debouncedBase ? { baseAsset: debouncedBase } : {}),
    ...(debouncedQuote ? { quoteAsset: debouncedQuote } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(sideFilter ? { side: sideFilter } : {}),
    ...(sortCol ? { sort: sortCol } : {}),
    ...(offset > 0 ? { offset } : {}),
    ...(includeHidden ? { includeHidden: true } : {}),
  }

  const { orders, total, isLoading } = useLatestOrders(tab, Object.keys(filters).length > 0 ? filters : undefined)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">DEX Orders</h1>
            <p className="text-xs text-zinc-500">Order book activity across all trading pairs</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideLowQuality}
                onChange={(e) => setHideLowQuality(e.target.checked)}
                className="accent-zinc-500 w-3 h-3"
              />
              <span className="text-xs text-zinc-500">Hide low quality</span>
            </label>
            <TogglePills
              options={TF_OPTIONS}
              value={timeframe}
              onChange={setTimeframe}
              label={(tf) => TF_LABELS[tf]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <CounterCard
            label="Trade Volume (XCP)"
            loading={summaryLoading}
            value={tradeSummary ? formatBig(tradeSummary.tf_volume) + ' XCP' : '\u2014'}
            sub={tradeSummary && tradeSummary.tf_trades > 0 ? `Avg: ${formatBig(tradeSummary.tf_volume / tradeSummary.tf_trades)} XCP` : undefined}
          />
          <CounterCard
            label="Orders Placed"
            loading={summaryLoading}
            value={tradeSummary ? tradeSummary.tf_orders.toLocaleString() : '\u2014'}
            sub={tradeSummary ? `${tradeSummary.open_orders.toLocaleString()} open` : undefined}
          />
          <CounterCard
            label="Trades"
            loading={summaryLoading}
            value={tradeSummary ? tradeSummary.tf_trades.toLocaleString() : '\u2014'}
            sub={tradeSummary?.tf_unique_traders ? `${tradeSummary.tf_unique_traders.toLocaleString()} addresses` : undefined}
          />
          <CounterCard
            label="Active Pairs"
            loading={summaryLoading}
            value={tradeSummary ? tradeSummary.active_pairs.toLocaleString() : '\u2014'}
            sub={tradeSummary ? (timeframe === 'all' ? `${tradeSummary.total_pairs.toLocaleString()} total` : tradeSummary.new_pairs ? `${tradeSummary.new_pairs.toLocaleString()} new` : undefined) : undefined}
          />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2 flex items-center gap-2">
            <select
              value={tag ?? ''}
              onChange={(e) => handleTagChange(e.target.value || null)}
              className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
            >
              <option value="">All Orders</option>
              {collections.filter(c => tab === 'open' || tab === 'expiring' ? c.open_orders_count > 0 : true).map(c => (
                <option key={c.slug} value={c.slug}>
                  {c.name}{tab === 'open' || tab === 'expiring' ? ` (${c.open_orders_count})` : ''}
                </option>
              ))}
            </select>
            {sourceFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-px text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                {formatAddress(sourceFilter)}
                <button onClick={() => setSourceFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
              </span>
            )}
            {sideFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-px text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 capitalize">
                {sideFilter}
                <button onClick={() => setSideFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
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

          <div className="overflow-x-auto">
            <OrdersTable tab={tab} orders={orders} isLoading={isLoading} blockHeight={blockHeight} baseSearch={baseSearch} quoteSearch={quoteSearch} onBaseSearch={setBaseSearch} onQuoteSearch={setQuoteSearch} onFilterAddress={setSourceFilter} sourceFilter={sourceFilter} onClearAddress={() => setSourceFilter(null)} sideFilter={sideFilter} onSideFilter={setSideFilter} sortCol={sortCol} onSortCol={setSortCol} />
          </div>
          <Pagination total={total} offset={offset} limit={250} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function OrdersTable({ tab, orders, isLoading, blockHeight, baseSearch, quoteSearch, onBaseSearch, onQuoteSearch, onFilterAddress, sourceFilter, onClearAddress, sideFilter, onSideFilter, sortCol, onSortCol }: {
  tab: OrderTab
  orders: LatestOrder[]
  isLoading: boolean
  blockHeight: number | null
  baseSearch: string
  quoteSearch: string
  onBaseSearch: (v: string) => void
  onQuoteSearch: (v: string) => void
  onFilterAddress: (addr: string) => void
  sourceFilter: string | null
  onClearAddress: () => void
  sideFilter: 'buy' | 'sell' | null
  onSideFilter: (v: 'buy' | 'sell' | null) => void
  sortCol: 'price:asc' | 'price:desc' | null
  onSortCol: (v: 'price:asc' | 'price:desc' | null) => void
}) {
  const showLastCol = tab !== 'all'
  const lastColHeader = tab === 'filled' ? 'Filled' : tab === 'expired' ? 'Expired' : tab === 'cancelled' ? 'Cancelled' : 'Expires'
  const lastColIsAgo = tab === 'filled' || tab === 'expired' || tab === 'cancelled'
  const [showSideMenu, setShowSideMenu] = useState(false)
  const [showAddrInput, setShowAddrInput] = useState(false)
  const [addrDraft, setAddrDraft] = useState('')
  const sideRef = useRef<HTMLDivElement>(null)
  const addrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sideRef.current && !sideRef.current.contains(e.target as Node)) setShowSideMenu(false)
      if (addrRef.current && !addrRef.current.contains(e.target as Node)) setShowAddrInput(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function cyclePriceSort() {
    if (sortCol === null) onSortCol('price:asc')
    else if (sortCol === 'price:asc') onSortCol('price:desc')
    else onSortCol(null)
  }

  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-3 py-1.5 w-10">
            <div className="relative inline-flex items-center gap-1" ref={sideRef}>
              <span>Side</span>
              <button onClick={() => setShowSideMenu(v => !v)} className={`transition-colors ${sideFilter ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}>
                <RiFilter3Line className="w-3 h-3" />
              </button>
              {showSideMenu && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-sm shadow-lg py-1 min-w-[70px]">
                  {(['buy', 'sell'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => { onSideFilter(sideFilter === s ? null : s); setShowSideMenu(false) }}
                      className={`block w-full text-left px-3 py-1 text-[10px] font-mono capitalize transition-colors ${sideFilter === s ? 'text-zinc-100 bg-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </th>
          <th className="text-right font-normal px-3 py-1.5">Amount</th>
          <th className="text-left font-normal px-3 py-0.5">
            <span className="relative flex items-center">
              <input
                type="text"
                value={baseSearch}
                onChange={(e) => onBaseSearch(e.target.value)}
                placeholder="Asset"
                className="w-full px-1.5 py-0.5 pr-5 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
              {baseSearch && (
                <button onClick={() => onBaseSearch('')} className="absolute right-1 text-zinc-600 hover:text-zinc-300 transition-colors text-[10px]">&times;</button>
              )}
            </span>
          </th>
          <th className="text-right font-normal px-3 py-1.5">
            <button
              onClick={cyclePriceSort}
              className="inline-flex items-center gap-0.5 cursor-pointer hover:text-zinc-300"
            >
              Price
              {sortCol === 'price:asc' && <span className="text-zinc-300">&#9650;</span>}
              {sortCol === 'price:desc' && <span className="text-zinc-300">&#9660;</span>}
            </button>
          </th>
          <th className="text-left font-normal px-3 py-0.5">
            <span className="relative flex items-center">
              <input
                type="text"
                value={quoteSearch}
                onChange={(e) => onQuoteSearch(e.target.value)}
                placeholder="Quote"
                className="w-full px-1.5 py-0.5 pr-5 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
              {quoteSearch && (
                <button onClick={() => onQuoteSearch('')} className="absolute right-1 text-zinc-600 hover:text-zinc-300 transition-colors text-[10px]">&times;</button>
              )}
            </span>
          </th>
          <th className="text-right font-normal px-3 py-1.5">Total</th>
          <th className="text-left font-normal px-3 py-1.5">
            <div className="relative inline-flex items-center gap-1" ref={addrRef}>
              <span>Address</span>
              {sourceFilter ? (
                <button onClick={onClearAddress} className="text-zinc-300 hover:text-zinc-100 transition-colors">
                  <RiCloseLine className="w-3 h-3" />
                </button>
              ) : (
                <>
                  <button onClick={() => { setShowAddrInput(v => !v); setAddrDraft('') }} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RiFilter3Line className="w-3 h-3" />
                  </button>
                  {showAddrInput && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-sm shadow-lg p-1.5">
                      <form onSubmit={(e) => { e.preventDefault(); if (addrDraft.trim()) { onFilterAddress(addrDraft.trim()); setShowAddrInput(false) } }}>
                        <input
                          autoFocus
                          type="text"
                          value={addrDraft}
                          onChange={(e) => setAddrDraft(e.target.value)}
                          placeholder="Paste address..."
                          className="w-48 px-1.5 py-0.5 text-[10px] font-mono bg-zinc-900 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                        />
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </th>
          <th className="text-left font-normal px-3 py-1.5">Status</th>
          {showLastCol && <th className="text-right font-normal px-3 py-1.5">{lastColHeader}</th>}
        </tr>
      </thead>
      <tbody>
        {isLoading || orders.length === 0 ? (
          <EmptyRows loading={isLoading} label="orders" cols={showLastCol ? 10 : 9} />
        ) : (
          orders.map((order) => {
            const [base, quote] = order.pair.split('_')
            const baseDisplay = order.base_asset_longname ?? base
            const quoteDisplay = order.quote_asset_longname ?? quote
            const isClosed = order.status !== 'open'
            const isBid = /^(buy|bid)$/i.test(order.side)
            // Open orders: show remaining amount; closed orders: show original amount
            const displayAmount = isClosed ? order.amount : order.remaining

            return (
              <tr key={order.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-500 font-mono px-3 py-1.5">
                  {order.block_time ? compactTime(order.block_time) : '—'}
                </td>
                <td className={`font-medium px-3 py-1.5 ${isBid ? 'text-green-400' : 'text-red-400'}`}>
                  {isBid ? 'Buy' : 'Sell'}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(displayAmount)}
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/trade/${order.pair}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${order.base_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{baseDisplay}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {isFinite(order.price) ? formatPrice(order.price) : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/trade/${order.pair}`} className="flex items-center gap-1.5 hover:underline decoration-zinc-400">
                    <Image src={`${XCP_IMG_BASE}/icon/${order.quote_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-400 truncate">{quoteDisplay}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {isFinite(order.price) ? formatPrice(order.price * displayAmount) : '—'}
                </td>
                <td className="text-left font-mono px-3 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">{formatAddress(order.source)}</span>
                    {!sourceFilter && (
                      <button
                        onClick={() => onFilterAddress(order.source)}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Filter by this address"
                      >
                        <RiFilter3Line className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                </td>
                <td className={`text-left font-mono px-3 py-1.5 capitalize ${isClosed ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {order.status}
                </td>
                {showLastCol && (
                  <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                    {blockHeight != null
                      ? lastColIsAgo
                        ? `${(blockHeight - (order.status === 'expired' ? order.expire_index : order.block_index)).toLocaleString()} blocks ago`
                        : `${Math.max(0, order.expire_index - blockHeight).toLocaleString()} blocks`
                      : '—'}
                  </td>
                )}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
