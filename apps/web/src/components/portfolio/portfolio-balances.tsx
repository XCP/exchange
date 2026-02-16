'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePortfolioBalances, usePortfolioBids, type PortfolioBid } from '@/lib/hooks/usePortfolio'
import { formatAmount } from '@/utils/format-amount'
import { getQuoteRank } from '@/utils/trading-pair'
import { XCP_IMG_BASE } from '@/utils/constants'

interface BidSummary {
  count: number
  bestPrice: number
  bestPriceFormatted: string
  bestQuote: string
  bids: PortfolioBid[]
}

export function PortfolioBalances({ address }: { address: string }) {
  const { balances, isLoading } = usePortfolioBalances(address)
  const { bids, isLoading: bidsLoading } = usePortfolioBids(address)
  const [showBidsOnly, setShowBidsOnly] = useState(false)
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null)

  // Group bids by base_asset, track best bid by quote priority then price
  const bidsByAsset = useMemo(() => {
    const map = new Map<string, BidSummary>()
    for (const bid of bids) {
      const existing = map.get(bid.base_asset)
      if (existing) {
        existing.count++
        existing.bids.push(bid)
        // Best bid = highest quote priority, then highest price within that quote
        const existingRank = getQuoteRank(existing.bestQuote)
        const bidRank = getQuoteRank(bid.quote_asset)
        if (bidRank < existingRank || (bidRank === existingRank && bid.price > existing.bestPrice)) {
          existing.bestPrice = bid.price
          existing.bestPriceFormatted = formatAmount(String(bid.price))
          existing.bestQuote = bid.quote_asset
        }
      } else {
        map.set(bid.base_asset, {
          count: 1,
          bestPrice: bid.price,
          bestPriceFormatted: formatAmount(String(bid.price)),
          bestQuote: bid.quote_asset,
          bids: [bid],
        })
      }
    }
    // Sort bids within each asset: by quote priority, then price desc
    for (const summary of map.values()) {
      summary.bids.sort((a, b) => {
        const rankDiff = getQuoteRank(a.quote_asset) - getQuoteRank(b.quote_asset)
        return rankDiff !== 0 ? rankDiff : b.price - a.price
      })
    }
    return map
  }, [bids])

  const filtered = showBidsOnly
    ? balances.filter((b) => bidsByAsset.has(b.asset))
    : balances

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-500">Loading balances...</span></div>
  }

  if (balances.length === 0) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-600">No balances</span></div>
  }

  const bidCount = bidsByAsset.size

  return (
    <div>
      {/* Filter toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBidsOnly}
            onChange={(e) => { setShowBidsOnly(e.target.checked); setExpandedAsset(null) }}
            className="accent-green-500"
          />
          <span className="text-xs text-zinc-400">
            With open bids
            {!bidsLoading && bidCount > 0 && (
              <span className="ml-1 text-green-400">({bidCount})</span>
            )}
          </span>
        </label>
        {bidsLoading && <span className="text-[10px] text-zinc-600">Loading bids...</span>}
      </div>

      {/* Header */}
      <div className={`grid gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800 ${
        showBidsOnly ? 'grid-cols-[1fr_auto_auto_auto]' : 'grid-cols-3'
      }`}>
        <span>Asset</span>
        <span className="text-right">Balance</span>
        {showBidsOnly && <span className="text-right">Best Bid</span>}
        <span className="text-right">{showBidsOnly ? 'Bids' : 'Trade'}</span>
      </div>

      {/* Rows */}
      <div className="px-1">
        {filtered.length === 0 && showBidsOnly && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-zinc-600">No open bids on your assets</span>
          </div>
        )}
        {filtered.map((b) => {
          const summary = bidsByAsset.get(b.asset)
          const isExpanded = expandedAsset === b.asset

          return (
            <div key={b.asset}>
              <div
                className={`grid gap-0 px-2 py-1.5 text-xs hover:bg-zinc-900 transition-colors items-center ${
                  showBidsOnly ? 'grid-cols-[1fr_auto_auto_auto] cursor-pointer' : 'grid-cols-3'
                }`}
                onClick={showBidsOnly && summary ? () => setExpandedAsset(isExpanded ? null : b.asset) : undefined}
              >
                <div className="flex items-center gap-2">
                  <img
                    src={`${XCP_IMG_BASE}/icon/${b.asset}`}
                    alt=""
                    className="h-4 w-4 rounded-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <span className="text-zinc-100 font-medium">{b.asset}</span>
                </div>
                <span className="text-right text-zinc-300 font-mono pl-4">{formatAmount(b.quantity_normalized)}</span>
                {showBidsOnly && summary && (
                  <span className="text-right text-green-400 font-mono pl-4">{summary.bestPriceFormatted} {summary.bestQuote}</span>
                )}
                {showBidsOnly && !summary && (
                  <span className="text-right text-zinc-700 pl-4">—</span>
                )}
                <div className="text-right pl-4">
                  {showBidsOnly && summary ? (
                    <span className={`font-mono ${isExpanded ? 'text-zinc-200' : 'text-zinc-400'}`}>
                      {summary.count} bid{summary.count !== 1 ? 's' : ''} {isExpanded ? '▴' : '▾'}
                    </span>
                  ) : (
                    <Link
                      href={`/trade/${b.asset}_XCP`}
                      className="text-green-400 hover:text-green-300 transition-colors"
                    >
                      Trade
                    </Link>
                  )}
                </div>
              </div>

              {/* Expanded bid details */}
              {showBidsOnly && isExpanded && summary && (
                <div className="bg-zinc-900/50 border-y border-zinc-800/50 mb-1">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 px-4 py-1 text-[10px] text-zinc-600 border-b border-zinc-800/30">
                    <span>They want</span>
                    <span className="text-right pl-4">They&apos;ll pay</span>
                    <span className="text-right pl-4">Price</span>
                    <span className="text-right pl-4">Sell</span>
                  </div>
                  {summary.bids.map((bid, i) => (
                      <div
                        key={`${bid.tx_hash}_${i}`}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-0 px-4 py-1 text-xs hover:bg-zinc-800/30 transition-colors items-center"
                      >
                        <span className="text-zinc-300 font-mono">{formatAmount(String(bid.amount))}</span>
                        <span className="text-right text-green-400/80 font-mono pl-4">{formatAmount(String(bid.price * bid.amount))} {bid.quote_asset}</span>
                        <span className="text-right text-zinc-400 font-mono pl-4">{formatAmount(String(bid.price))} {bid.quote_asset}/ea</span>
                        <div className="text-right pl-4">
                          <Link
                            href={`/trade/${bid.pair.replace('/', '_')}`}
                            className="text-green-400 hover:text-green-300 transition-colors text-[10px]"
                          >
                            Sell
                          </Link>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
