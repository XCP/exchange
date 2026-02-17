'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSwapListings, type SwapListing } from '@/lib/hooks/useSwapListings'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useSatsMode } from '@/lib/sats-context'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { DEX_API_BASE, XCP_IMG_BASE } from '@/utils/constants'

type Tab = 'active' | 'filled'
type SortKey = 'price_asc' | 'price_desc' | 'created_at_desc' | 'created_at_asc'
type SwapStatus = 'idle' | 'submitting' | 'success' | 'error'

export default function SwapPage() {
  const { satsMode } = useSatsMode()
  const { address } = useWallet()
  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [assetFilter, setAssetFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('created_at_desc')
  const [buyingId, setBuyingId] = useState<string | null>(null)

  const status = activeTab === 'filled' ? 'filled' : 'active'
  const { listings, total, isLoading, mutate } = useSwapListings({
    asset: assetFilter || undefined,
    status,
    sort,
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Atomic Swaps</h1>
          <p className="text-xs text-zinc-500">
            Trustless PSBT-based swaps for UTXO-attached Counterparty assets
          </p>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-6 mb-4 text-xs">
          <div>
            <span className="text-zinc-500">Active Listings</span>{' '}
            <span className="text-zinc-300 font-mono">{activeTab === 'active' ? total : '—'}</span>
          </div>
        </div>

        {/* Tab bar + filters */}
        <div className="flex items-center gap-1 mb-4">
          {([
            ['active', 'Active Listings'],
            ['filled', 'Recent Fills'],
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

          <div className="ml-auto flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter by asset..."
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 w-40 focus:outline-none focus:border-zinc-600"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
            >
              <option value="created_at_desc">Newest</option>
              <option value="created_at_asc">Oldest</option>
              <option value="price_asc">Price Low-High</option>
              <option value="price_desc">Price High-Low</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="border border-zinc-800 rounded-sm overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left font-normal px-3 py-2.5">Asset</th>
                <th className="text-right font-normal px-3 py-2.5">Quantity</th>
                <th className="text-right font-normal px-3 py-2.5">{satsMode ? 'Price (sats)' : 'Price (BTC)'}</th>
                <th className="text-right font-normal px-3 py-2.5">{satsMode ? 'Unit (sats)' : 'Unit (BTC)'}</th>
                <th className="text-right font-normal px-3 py-2.5 max-sm:hidden">Seller</th>
                {activeTab === 'filled' && <th className="text-right font-normal px-3 py-2.5 max-sm:hidden">Buyer</th>}
                <th className="text-right font-normal px-3 py-2.5">{activeTab === 'filled' ? 'Filled' : 'Listed'}</th>
                <th className="text-right font-normal px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={activeTab === 'filled' ? 8 : 7} className="text-center py-20 text-sm text-zinc-500">
                    Loading swap listings...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'filled' ? 8 : 7} className="text-center py-20 text-sm text-zinc-600">
                    {activeTab === 'filled' ? 'No completed swaps yet' : 'No active swap listings'}
                  </td>
                </tr>
              ) : (
                listings.map((listing) => {
                  const unitPrice = listing.price_sats / listing.asset_quantity
                  const unitPriceBtc = unitPrice / 1e8
                  const totalPriceBtc = listing.price_sats / 1e8

                  return (
                    <tr
                      key={listing.id}
                      className="hover:bg-zinc-900 transition-colors border-b border-zinc-800/50 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <Link href={`/swap/${listing.asset}`} className="flex items-center gap-2">
                          <Image
                            src={`${XCP_IMG_BASE}/icon/${listing.asset}`}
                            alt=""
                            width={16}
                            height={16}
                            className="rounded-sm"
                            unoptimized
                          />
                          <span className="text-zinc-200 font-medium hover:underline">
                            {listing.asset_longname ?? listing.asset}
                          </span>
                        </Link>
                      </td>
                      <td className="text-right text-zinc-300 font-mono px-3 py-2">
                        {formatAmount(listing.asset_quantity)}
                      </td>
                      <td className="text-right text-zinc-300 font-mono px-3 py-2">
                        {satsMode
                          ? listing.price_sats.toLocaleString()
                          : formatPrice(totalPriceBtc, false)}
                      </td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">
                        {satsMode
                          ? unitPrice < 1
                            ? unitPrice.toPrecision(2)
                            : Math.round(unitPrice).toLocaleString()
                          : formatPrice(unitPriceBtc, false)}
                      </td>
                      <td className="text-right text-zinc-500 font-mono px-3 py-2 max-sm:hidden">
                        {formatAddress(listing.seller_address)}
                      </td>
                      {activeTab === 'filled' && (
                        <td className="text-right text-zinc-500 font-mono px-3 py-2 max-sm:hidden">
                          {listing.buyer_address ? formatAddress(listing.buyer_address) : '—'}
                        </td>
                      )}
                      <td className="text-right text-zinc-600 font-mono px-3 py-2">
                        {listing.created_at ? formatTimeAgo(new Date(listing.created_at + 'Z').getTime() / 1000) : '—'}
                      </td>
                      <td className="text-right px-3 py-2">
                        {listing.status === 'active' && address && address !== listing.seller_address && (
                          <button
                            onClick={() => setBuyingId(listing.id)}
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold rounded-sm transition-colors"
                          >
                            Buy
                          </button>
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
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Buy modal */}
        {buyingId && (
          <BuyModal
            listing={listings.find((l) => l.id === buyingId)!}
            satsMode={satsMode}
            onClose={() => setBuyingId(null)}
            onFilled={() => { setBuyingId(null); mutate() }}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Buy Modal
// ---------------------------------------------------------------------------
function BuyModal({
  listing,
  satsMode,
  onClose,
  onFilled,
}: {
  listing: SwapListing
  satsMode: boolean
  onClose: () => void
  onFilled: () => void
}) {
  const { address } = useWallet()
  const [buyerPsbt, setBuyerPsbt] = useState('')
  const [status, setStatus] = useState<SwapStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  const totalPriceBtc = listing.price_sats / 1e8
  const unitPrice = listing.price_sats / listing.asset_quantity

  async function handleFill() {
    if (!address || !buyerPsbt.trim()) return
    setStatus('submitting')
    setError(null)

    try {
      const res = await fetch(`${DEX_API_BASE}/swaps/${listing.id}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_address: address,
          psbt_hex: buyerPsbt.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Fill failed')
      }

      setTxId(data.tx_id)
      setStatus('success')
      setTimeout(onFilled, 3000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-sm w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">Buy Swap</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
        </div>

        <div className="px-4 py-3 border-b border-zinc-800 space-y-2">
          <div className="flex items-center gap-2">
            <Image
              src={`${XCP_IMG_BASE}/icon/${listing.asset}`}
              alt=""
              width={20}
              height={20}
              className="rounded-sm"
              unoptimized
            />
            <span className="text-sm font-medium text-zinc-200">
              {listing.asset_longname ?? listing.asset}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Quantity</span>
              <div className="text-zinc-200 font-mono">{formatAmount(listing.asset_quantity)}</div>
            </div>
            <div>
              <span className="text-zinc-500">Total Price</span>
              <div className="text-zinc-200 font-mono">
                {satsMode
                  ? `${listing.price_sats.toLocaleString()} sats`
                  : `${formatPrice(totalPriceBtc, false)} BTC`}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Unit Price</span>
              <div className="text-zinc-400 font-mono">
                {satsMode
                  ? `${unitPrice < 1 ? unitPrice.toPrecision(2) : Math.round(unitPrice).toLocaleString()} sats`
                  : `${formatPrice(unitPrice / 1e8, false)} BTC`}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Seller</span>
              <div className="text-zinc-400 font-mono">{formatAddress(listing.seller_address)}</div>
            </div>
          </div>

          <div className="text-[10px] text-zinc-600">
            UTXO: {listing.utxo_txid.slice(0, 12)}...:{listing.utxo_vout}
          </div>
        </div>

        <div className="px-4 py-3 space-y-2">
          <label className="block">
            <span className="text-[10px] text-zinc-500 mb-1 block">
              Your Signed PSBT (hex)
              <span className="text-zinc-600 ml-1">— include seller&apos;s UTXO as input 0 (unsigned), your funding inputs signed</span>
            </span>
            <textarea
              value={buyerPsbt}
              onChange={(e) => setBuyerPsbt(e.target.value.replace(/\s/g, ''))}
              placeholder="70736274ff..."
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-zinc-600 resize-none"
            />
          </label>

          {address && (
            <div className="text-[10px] text-zinc-600">
              Buyer: <span className="font-mono text-zinc-500">{address}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleFill}
              disabled={status !== 'idle' || !buyerPsbt.trim() || !address}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-sm transition-colors"
            >
              {status === 'submitting' ? 'Filling...' :
               status === 'success' ? 'Filled!' :
               'Confirm Purchase'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium rounded-sm transition-colors"
            >
              Cancel
            </button>
          </div>

          {error && <p className="text-red-400 text-[10px]">{error}</p>}
          {txId && (
            <p className="text-green-400 text-[10px]">
              Transaction broadcast!{' '}
              <a
                href={`https://mempool.space/tx/${txId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {txId.slice(0, 12)}...
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
