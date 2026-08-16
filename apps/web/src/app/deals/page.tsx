'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useDeals, type DealEntry } from '@/lib/hooks/useDeals'
import { Pagination } from '@/components/Pagination'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'
import { marketPath } from '@/utils/pairs'

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

type SortOption = 'score' | 'discount_pct' | 'avg_days_between_trades' | 'total_trade_count' | 'listing_price'

const SORT_OPTIONS: [SortOption, string][] = [
  ['score', 'Best Score'],
  ['discount_pct', 'Biggest Discount'],
  ['avg_days_between_trades', 'Most Frequent'],
  ['total_trade_count', 'Most Traded'],
  ['listing_price', 'Cheapest'],
]

const QUOTE_OPTIONS: [string, string][] = [
  ['', 'All'],
  ['XCP', 'XCP'],
  ['PEPECASH', 'PEPECASH'],
  ['BITCORN', 'BITCORN'],
  ['BTC', 'BTC'],
]

function DealRow({ deal }: { deal: DealEntry }) {
  const displayName = deal.asset_longname ?? deal.asset
  const hasDiscount = deal.discount_pct !== null && deal.discount_pct > 0
  const pairSlug = `${deal.asset}_${deal.quote}`

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 hover:bg-zinc-800/30 transition-colors flex gap-4 p-3">
      {/* Large image */}
      <Link href={marketPath(pairSlug)} className="flex-shrink-0">
        <Image
          src={`${XCP_IMG_BASE}/full/${deal.asset}`}
          alt=""
          width={120}
          height={120}
          className="rounded-sm object-cover"
          unoptimized
        />
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top line: name, badges, score */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={marketPath(pairSlug)} className="font-semibold text-sm text-zinc-100 hover:text-white truncate">
                {displayName}
              </Link>
              {hasDiscount && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-green-900/50 text-green-400 flex-shrink-0">
                  -{deal.discount_pct}%
                </span>
              )}
              <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-1 rounded-sm flex-shrink-0">
                {deal.listing_type}
              </span>
              {deal.supply != null && (
                <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-1 rounded-sm flex-shrink-0">
                  {deal.supply < 1000 ? deal.supply : `${(deal.supply / 1000).toFixed(1)}k`} supply
                </span>
              )}
              {deal.locked != null && (
                <span className={`text-[10px] px-1 rounded-sm flex-shrink-0 ${
                  deal.locked ? 'bg-green-900/30 text-green-500' : 'bg-red-900/30 text-red-400'
                }`}>
                  {deal.locked ? 'locked' : 'unlocked'}
                </span>
              )}
            </div>
            {deal.collections.length > 0 && (
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {deal.collections.slice(0, 3).map(c => (
                  <span key={c.slug} className="text-[10px] text-zinc-500 bg-zinc-800/50 px-1 rounded-sm">
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-[10px] text-zinc-500">Score</span>
              <span className={`text-[9px] font-bold px-1 rounded-sm ${
                deal.score_confidence === 'HIGH' ? 'bg-green-900/50 text-green-400' :
                deal.score_confidence === 'MEDIUM' ? 'bg-yellow-900/50 text-yellow-400' :
                'bg-zinc-800/50 text-zinc-500'
              }`}>
                {deal.score_confidence}
              </span>
            </div>
            <div className="font-mono text-sm font-bold text-zinc-300">{deal.score}</div>
          </div>
        </div>

        {/* Listing + fair value */}
        <div className="flex items-center gap-4 mt-2 text-[11px]">
          <div className="px-2 py-1 rounded-sm bg-green-900/20 border border-green-900/30">
            <span className="text-green-400">
              {deal.listing_type === 'dispenser' ? 'Dispenser' : 'Sell order'}:
            </span>{' '}
            <span className="font-mono font-bold text-green-300">
              {formatPrice(deal.listing_price)} {deal.quote}
            </span>
            {deal.listing_qty != null && (
              <span className="text-zinc-500 ml-1.5">
                qty {deal.listing_qty.toLocaleString()}
              </span>
            )}
          </div>
          <div>
            <span className="text-zinc-500">Fair:</span>{' '}
            <span className="font-mono text-zinc-300">{formatPrice(deal.fair_value)} {deal.quote}</span>
          </div>
          <div>
            <span className="text-zinc-500">Last:</span>{' '}
            <span className="font-mono text-zinc-300">{formatPrice(deal.last_price)} {deal.quote}</span>
          </div>
          {deal.highest_price != null && (
            <div>
              <span className="text-zinc-500">ATH:</span>{' '}
              <span className="font-mono text-zinc-300">{formatPrice(deal.highest_price)}</span>
            </div>
          )}
        </div>

        {/* Recent sales */}
        {deal.recent_sales.length > 0 && (
          <div className="mt-1.5 text-[10px]">
            <span className="text-zinc-500">Recent: </span>
            {deal.recent_sales.map((s, i) => (
              <span key={i} className="font-mono text-zinc-400 bg-zinc-800/50 px-1 rounded-sm mr-1">
                {formatPrice(s.price)} <span className="text-zinc-600">{compactTime(s.date)}</span>
              </span>
            ))}
          </div>
        )}

        {/* Stats footer */}
        <div className="flex gap-3 mt-1.5 text-[10px] text-zinc-500">
          <span>{deal.total_trades} {deal.listing_type === 'dispenser' ? 'dispenses' : 'trades'}</span>
          <span>every {compactDays(deal.avg_days_between_trades)}</span>
          <span>last {compactDays(deal.last_trade_days_ago)} ago</span>
          {deal.active_buy_orders > 0 && (
            <span className="text-blue-400">{deal.active_buy_orders} bids</span>
          )}
          {deal.listing_block_time && (
            <span>listed {compactTime(deal.listing_block_time)} ago</span>
          )}
          {deal.dispenser_active > 0 && deal.listing_type !== 'dispenser' && (
            <span>{deal.dispenser_active} dispensers</span>
          )}
        </div>
        {/* Warning flags */}
        {deal.warning_flags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {deal.warning_flags.map(flag => (
              <span key={flag} className="text-[9px] px-1 rounded-sm bg-red-900/30 text-red-400/80">
                {flag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DealsPage() {
  const [sort, setSort] = useState<SortOption>('score')
  const [quote, setQuote] = useState('')
  const [page, setPage] = useState(1)

  const { deals, total, totalPages, isLoading } = useDeals(sort, quote || undefined, page)

  return (
    <div className="max-w-5xl mx-auto px-3 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Best Deals</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Open orders and dispensers priced below fair market value.
          Fair value = median of recent trades.
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
        {isLoading ? 'Loading...' : `${total} deals found`}
      </div>

      {/* Deal rows */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-zinc-800 rounded-sm bg-zinc-900/50 h-32 animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-xs">
          No deals found. Check back later.
        </div>
      ) : (
        <div className="space-y-2">
          {deals.map(deal => (
            <DealRow key={deal.listing_id} deal={deal} />
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
