'use client'

import { useCallback, useRef } from 'react'
import { useTrades } from '@/lib/hooks/useTrades'
import { formatAmountTrade } from '@/utils/format-amount-trade'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatAddress } from '@/utils/format-address'

interface TradesListProps {
  market: string
  baseSymbol: string
  quoteSymbol: string
}

export function TradesList({ market, baseSymbol, quoteSymbol }: TradesListProps) {
  const { trades, isLoading, loadMore, loadingMore, hasMore } = useTrades(market, baseSymbol, quoteSymbol)
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Callback ref: fires when the sentinel DOM node mounts/unmounts
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current()
        }
      },
      { rootMargin: '200px' }
    )
    observerRef.current.observe(node)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-500">Loading trades...</span>
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-600">No trades found</span>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-0 px-3 py-1.5 text-xs text-zinc-600 sticky top-0 bg-zinc-950 z-10">
        <span>Price ({quoteSymbol})</span>
        <span className="text-right">Amount</span>
        <span className="text-right max-sm:hidden">Maker</span>
        <span className="text-right max-sm:hidden">Taker</span>
        <span className="text-right">Time</span>
      </div>
      <div className="px-1">
        {trades.map((trade) => (
          <div
            key={trade.id ?? `${trade.tx0}-${trade.tx1}`}
            className="grid grid-cols-3 sm:grid-cols-5 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-default"
          >
            <span className={`font-mono ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {formatAmountTrade(trade.price)}
            </span>
            <span className="text-right text-zinc-400 font-mono">{formatAmountTrade(trade.amount)}</span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">
              {formatAddress(trade.maker)}
            </span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">
              {formatAddress(trade.taker)}
            </span>
            <span className="text-right text-zinc-600 font-mono">
              {trade.block_time ? formatTimeAgo(trade.block_time) : '—'}
            </span>
          </div>
        ))}
        {loadingMore && (
          <div className="flex items-center justify-center py-2">
            <span className="text-xs text-zinc-500">Loading more...</span>
          </div>
        )}
        {!hasMore && trades.length > 50 && (
          <div className="flex items-center justify-center py-2">
            <span className="text-xs text-zinc-700">{trades.length} trades loaded</span>
          </div>
        )}
        {/* Sentinel: callback ref sets up IntersectionObserver when this mounts */}
        {hasMore && <div ref={sentinelRef} className="h-px" />}
      </div>
    </div>
  )
}
