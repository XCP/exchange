'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSwapListings, type SwapListing } from '@/lib/hooks/useSwapListings'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useSatsMode } from '@/lib/sats-context'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { DEX_API_BASE, XCP_IMG_BASE } from '@/utils/constants'

type StatusFilter = 'active' | 'filled' | 'cancelled'

export function PortfolioSwaps({ address }: { address: string }) {
  const { satsMode } = useSatsMode()
  const { signMessage } = useWallet()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const { listings, isLoading, mutate } = useSwapListings({
    seller: address,
    status: statusFilter,
    sort: 'created_at_desc',
  })

  async function handleCancel(listing: SwapListing) {
    setCancellingId(listing.id)
    setCancelError(null)

    try {
      // Step 1: Get challenge from server
      const prepareRes = await fetch(`${DEX_API_BASE}/swaps/${listing.id}/prepare-cancel`, {
        method: 'POST',
      })
      const prepareData = await prepareRes.json()
      if (!prepareRes.ok) {
        throw new Error(prepareData.error || 'Failed to prepare cancel')
      }

      // Step 2: Sign the challenge with wallet
      const signature = await signMessage(prepareData.challenge)

      // Step 3: Submit signed cancel
      const res = await fetch(`${DEX_API_BASE}/swaps/${listing.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_address: address,
          challenge: prepareData.challenge,
          signature,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Cancel failed')
      }

      mutate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setCancelError(msg)
    } finally {
      setCancellingId(null)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><span className="text-xs text-zinc-500">Loading swap listings...</span></div>
  }

  return (
    <div>
      {/* Status filter */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800">
        {([
          ['active', 'Active'],
          ['filled', 'Filled'],
          ['cancelled', 'Cancelled'],
        ] as const).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
              statusFilter === s
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {cancelError && (
        <div className="px-3 py-1.5 text-[10px] text-red-400 border-b border-zinc-800">
          {cancelError}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <span className="text-xs text-zinc-500">
            No {statusFilter} swap listings
          </span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="grid grid-cols-6 gap-0 px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800 max-sm:grid-cols-4">
            <span>Asset</span>
            <span className="text-right">Quantity</span>
            <span className="text-right">{satsMode ? 'Price (sats)' : 'Price (BTC)'}</span>
            <span className="text-right max-sm:hidden">{satsMode ? 'Unit (sats)' : 'Unit (BTC)'}</span>
            <span className="text-right max-sm:hidden">
              {statusFilter === 'filled' ? 'Filled' : statusFilter === 'cancelled' ? 'Cancelled' : 'Listed'}
            </span>
            <span className="text-right"></span>
          </div>

          {/* Rows */}
          <div className="px-1">
            {listings.map((listing) => {
              const unitPrice = listing.price_sats / listing.asset_quantity
              const unitPriceBtc = unitPrice / 1e8
              const totalPriceBtc = listing.price_sats / 1e8

              return (
                <div
                  key={listing.id}
                  className="grid grid-cols-6 gap-0 px-2 py-1.5 text-xs hover:bg-zinc-900 transition-colors items-center max-sm:grid-cols-4"
                >
                  <Link href={`/swap/${listing.asset}`} className="flex items-center gap-2">
                    <Image
                      src={`${XCP_IMG_BASE}/icon/${listing.asset}`}
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-sm"
                      unoptimized
                    />
                    <span className="text-zinc-100 font-medium hover:underline">
                      {listing.asset_longname ?? listing.asset}
                    </span>
                  </Link>
                  <span className="text-right text-zinc-300 font-mono">
                    {formatAmount(listing.asset_quantity)}
                  </span>
                  <span className="text-right text-zinc-300 font-mono">
                    {satsMode
                      ? listing.price_sats.toLocaleString()
                      : formatPrice(totalPriceBtc, false)}
                  </span>
                  <span className="text-right text-zinc-400 font-mono max-sm:hidden">
                    {satsMode
                      ? unitPrice < 1
                        ? unitPrice.toPrecision(2)
                        : Math.round(unitPrice).toLocaleString()
                      : formatPrice(unitPriceBtc, false)}
                  </span>
                  <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                    {listing.created_at ? formatTimeAgo(new Date(listing.created_at + 'Z').getTime() / 1000) : '—'}
                  </span>
                  <div className="text-right">
                    {listing.status === 'active' && (
                      <button
                        onClick={() => handleCancel(listing)}
                        disabled={cancellingId === listing.id}
                        className="text-red-400 hover:text-red-300 text-[10px] font-medium transition-colors disabled:opacity-50"
                      >
                        {cancellingId === listing.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                    {listing.status === 'pending_fill' && (
                      listing.broadcast_txid ? (
                        <a
                          href={`https://mempool.space/tx/${listing.broadcast_txid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-yellow-400 hover:text-yellow-300 text-[10px] font-medium"
                        >
                          Confirming...
                        </a>
                      ) : (
                        <span className="text-yellow-500 text-[10px] font-medium">Pending...</span>
                      )
                    )}
                    {listing.status === 'filled' && listing.tx_id && (
                      <a
                        href={`https://mempool.space/tx/${listing.tx_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-[10px] font-mono"
                      >
                        view tx
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
