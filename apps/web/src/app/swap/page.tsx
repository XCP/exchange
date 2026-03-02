'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSwapListings } from '@/lib/hooks/useSwapListings'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useSatsMode } from '@/lib/sats-context'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

type Tab = 'active' | 'filled'
type SortKey = 'price_asc' | 'price_desc' | 'created_at_desc' | 'created_at_asc'

export default function SwapPage() {
  const { satsMode } = useSatsMode()
  const { address } = useWallet()
  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [assetFilter, setAssetFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('created_at_desc')
  const status = activeTab === 'filled' ? 'filled' : 'active'
  const { listings, total, isLoading } = useSwapListings({
    asset: assetFilter || undefined,
    status,
    sort,
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Atomic Swaps</h1>
            <p className="text-xs text-zinc-500">
              Trustless PSBT-based swaps for UTXO-attached Counterparty assets
            </p>
          </div>
          {address && (
            <Link
              href="/swap/sell"
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-sm transition-colors"
            >
              List for Sale
            </Link>
          )}
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
                          <Link
                            href={`/swap/buy/${listing.id}`}
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold rounded-sm transition-colors"
                          >
                            Buy
                          </Link>
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
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
