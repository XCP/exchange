'use client'

import { useCallback, useRef } from 'react'
import { useTrades } from '@/lib/hooks/useTrades'
import { formatPrice } from '@/utils/format-price'
import { formatAddress } from '@/utils/format-address'

interface TradesListProps {
  market: string
  baseSymbol: string
  quoteSymbol: string
}

function compactTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

export function TradesList({ market, baseSymbol, quoteSymbol }: TradesListProps) {
  const { trades, isLoading, loadMore, loadingMore, hasMore } = useTrades(market, baseSymbol, quoteSymbol)
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore
  const observerRef = useRef<IntersectionObserver | null>(null)

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
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-zinc-950 z-10">
          <tr className="text-zinc-600">
            <th className="text-left font-normal px-2 py-1.5 w-10">Time</th>
            <th className="text-left font-normal px-2 py-1.5 w-10">Type</th>
            <th className="text-right font-normal px-2 py-1.5">Price</th>
            <th className="text-right font-normal px-2 py-1.5">{baseSymbol}</th>
            <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">{quoteSymbol}</th>
            <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Taker</th>
            <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Maker</th>
            <th className="font-normal px-2 py-1.5 w-6 max-sm:hidden"><span className="sr-only">Tx</span></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr
              key={trade.id ?? `${trade.tx0}-${trade.tx1}`}
              className="hover:bg-zinc-900 cursor-default"
            >
              <td className="text-zinc-600 font-mono px-2 py-px">
                {trade.block_time ? compactTime(trade.block_time) : '—'}
              </td>
              <td className={`font-medium px-2 py-px ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                {trade.side === 'buy' ? 'Buy' : 'Sell'}
              </td>
              <td className="text-right text-zinc-300 font-mono px-2 py-px">
                {formatPrice(trade.price)}
              </td>
              <td className="text-right text-zinc-400 font-mono px-2 py-px">
                {formatPrice(trade.amount)}
              </td>
              <td className="text-right text-zinc-400 font-mono px-2 py-px max-sm:hidden">
                {formatPrice(trade.volume)}
              </td>
              <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                {formatAddress(trade.taker)}
              </td>
              <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                {formatAddress(trade.maker)}
              </td>
              <td className="text-center px-2 py-px max-sm:hidden">
                <a
                  href={`https://xcp.io/tx/${trade.tx0}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  title="View transaction"
                >
                  ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      {hasMore && <div ref={sentinelRef} className="h-px" />}
    </div>
  )
}
