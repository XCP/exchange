'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useDeals, type DealEntry } from '@/lib/hooks/useDeals'
import { Pagination } from '@/components/Pagination'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

function compactTime(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

function compactDays(days: number): string {
  if (days < 1) return '<1d'
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

type SortOption = 'score' | 'discount_pct' | 'avg_days_between_trades' | 'total_trade_count'

const SORT_OPTIONS: [SortOption, string][] = [
  ['score', 'Best Score'],
  ['discount_pct', 'Biggest Discount'],
  ['avg_days_between_trades', 'Most Frequent'],
  ['total_trade_count', 'Most Traded'],
]

const QUOTE_OPTIONS: [string, string][] = [
  ['', 'All Quotes'],
  ['XCP', 'XCP'],
  ['PEPECASH', 'PEPECASH'],
]

function DealCard({ deal }: { deal: DealEntry }) {
  const displayName = deal.asset_longname ?? deal.asset
  const hasDiscount = deal.discount_pct !== null && deal.discount_pct > 0
  const pairSlug = `${deal.asset}_${deal.quote}`

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 hover:bg-zinc-800/30 transition-colors">
      {/* Header with image and asset name */}
      <div className="flex items-start gap-3 p-3 pb-2">
        <Link href={`/trade/${pairSlug}`}>
          <Image
            src={`${XCP_IMG_BASE}/icon/${deal.asset}`}
            alt=""
            width={48}
            height={48}
            className="rounded-sm flex-shrink-0"
            unoptimized
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/trade/${pairSlug}`} className="font-semibold text-sm text-zinc-100 hover:text-white truncate">
              {displayName}
            </Link>
            {hasDiscount && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-green-900/50 text-green-400 flex-shrink-0">
                -{deal.discount_pct}%
              </span>
            )}
          </div>
          {deal.collections.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {deal.collections.slice(0, 2).map(c => (
                <span key={c.slug} className="text-[10px] text-zinc-500 bg-zinc-800/50 px-1 rounded-sm">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] text-zinc-500">Score</div>
          <div className="font-mono text-sm font-bold text-zinc-300">{deal.score}</div>
        </div>
      </div>

      {/* Price context */}
      <div className="grid grid-cols-3 gap-px bg-zinc-800/30 mx-3 rounded-sm overflow-hidden text-[11px]">
        <div className="bg-zinc-900 px-2 py-1.5">
          <div className="text-zinc-500">Fair Value</div>
          <div className="font-mono text-zinc-200">{formatPrice(deal.fair_value)} {deal.quote}</div>
        </div>
        <div className="bg-zinc-900 px-2 py-1.5">
          <div className="text-zinc-500">Last Price</div>
          <div className="font-mono text-zinc-200">{formatPrice(deal.last_price)} {deal.quote}</div>
        </div>
        <div className="bg-zinc-900 px-2 py-1.5">
          <div className="text-zinc-500">ATH</div>
          <div className="font-mono text-zinc-200">{deal.highest_price != null ? formatPrice(deal.highest_price) : '—'}</div>
        </div>
      </div>

      {/* Current listing */}
      {deal.cheapest_listing_price != null && (
        <div className="mx-3 mt-1 px-2 py-1.5 rounded-sm bg-green-900/20 border border-green-900/30 text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-green-400">
              {deal.cheapest_listing_type === 'dispenser' ? 'Dispenser' : 'Order'} listed at
            </span>
            <span className="font-mono font-bold text-green-300">
              {formatPrice(deal.cheapest_listing_price)} {deal.quote}
            </span>
          </div>
          {deal.cheapest_listing_qty != null && (
            <div className="text-zinc-500 mt-0.5">
              Qty: {deal.cheapest_listing_qty.toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Recent sales */}
      {deal.recent_sales.length > 0 && (
        <div className="mx-3 mt-1.5 text-[10px]">
          <div className="text-zinc-500 mb-0.5">Recent sales</div>
          <div className="flex gap-1 flex-wrap">
            {deal.recent_sales.map((s, i) => (
              <span key={i} className="font-mono text-zinc-400 bg-zinc-800/50 px-1 rounded-sm">
                {formatPrice(s.price)} <span className="text-zinc-600">{compactTime(s.date)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="flex gap-3 px-3 py-2 mt-1 text-[10px] text-zinc-500 border-t border-zinc-800/50">
        <span>{deal.total_trades} trades</span>
        <span>every {compactDays(deal.avg_days_between_trades)}</span>
        <span>last {compactDays(deal.last_trade_days_ago)} ago</span>
        {deal.active_buy_orders > 0 && (
          <span className="text-blue-400">{deal.active_buy_orders} bids</span>
        )}
        {deal.dispenser_active > 0 && (
          <span>{deal.dispenser_active} dispensers</span>
        )}
      </div>
    </div>
  )
}

export default function DealsPage() {
  const [sort, setSort] = useState<SortOption>('score')
  const [quote, setQuote] = useState('')
  const [page, setPage] = useState(1)

  const { deals, total, totalPages, isLoading } = useDeals(sort, quote || undefined, 5, page)

  return (
    <div className="max-w-6xl mx-auto px-3 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Best Deals</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Counterparty collectibles listed below their fair market value.
          Fair value is the median of recent trades.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          {SORT_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setSort(value); setPage(1) }}
              className={`px-2 py-1 text-[11px] rounded-sm transition-colors ${
                sort === value
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {QUOTE_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setQuote(value); setPage(1) }}
              className={`px-2 py-1 text-[11px] rounded-sm transition-colors ${
                quote === value
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="text-[11px] text-zinc-500 mb-3">
        {isLoading ? 'Loading...' : `${total} assets scored`}
      </div>

      {/* Deal cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-zinc-800 rounded-sm bg-zinc-900/50 h-48 animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-xs">
          No deals found. Check back later.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {deals.map(deal => (
            <DealCard key={`${deal.asset}-${deal.quote}`} deal={deal} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            offset={(page - 1) * 50}
            total={total}
            limit={50}
            onOffsetChange={(newOffset) => setPage(Math.floor(newOffset / 50) + 1)}
          />
        </div>
      )}
    </div>
  )
}
