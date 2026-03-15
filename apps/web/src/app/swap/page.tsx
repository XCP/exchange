'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { RiFilter3Line, RiCloseLine } from 'react-icons/ri'
import { useSwapListings, type SwapListing } from '@/lib/hooks/useSwapListings'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useSatsMode } from '@/lib/sats-context'
import { Pagination } from '@/components/Pagination'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

type Tab = 'active' | 'filled'
type SortKey = 'price_asc' | 'price_desc' | 'created_at_desc' | 'created_at_asc'

const TABS: [Tab, string][] = [
  ['active', 'Active'],
  ['filled', 'Filled'],
]

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

export default function SwapPage() {
  return <Suspense><SwapPageInner /></Suspense>
}

function SwapPageInner() {
  const { satsMode } = useSatsMode()
  const { address } = useWallet()
  const [tab, setTab] = useState<Tab>('active')
  const [assetSearch, setAssetSearch] = useState('')
  const [debouncedAsset, setDebouncedAsset] = useState('')
  const [sellerFilter, setSellerFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('created_at_desc')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAsset(assetSearch), 300)
    return () => clearTimeout(timer)
  }, [assetSearch])

  useEffect(() => {
    setOffset(0)
  }, [tab, debouncedAsset, sellerFilter, sort])

  const status = tab === 'filled' ? 'filled' : 'active'
  const { listings, total, isLoading } = useSwapListings({
    asset: debouncedAsset || undefined,
    seller: sellerFilter || undefined,
    status,
    sort,
    limit: 50,
    offset,
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Atomic Swaps</h1>
            <p className="text-xs text-zinc-500">Trustless PSBT-based swaps for UTXO-attached Counterparty assets</p>
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

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          {/* Mobile: stacked rows */}
          <div className="sm:hidden px-3 py-2 flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as Tab)}
                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
              >
                {TABS.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
              >
                <option value="created_at_desc">Newest</option>
                <option value="created_at_asc">Oldest</option>
                <option value="price_asc">Price Low-High</option>
                <option value="price_desc">Price High-Low</option>
              </select>
            </div>
            {sellerFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                {formatAddress(sellerFilter)}
                <button onClick={() => setSellerFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
              </span>
            )}
          </div>
          {/* Desktop: single row */}
          <div className="hidden sm:flex px-3 py-2 items-center gap-2">
            {sellerFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-px text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                {formatAddress(sellerFilter)}
                <button onClick={() => setSellerFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
              </span>
            )}
            <div className="flex gap-0.5 ml-auto">
              {TABS.map(([key, label]) => (
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
            <SwapTable
              tab={tab}
              listings={listings}
              isLoading={isLoading}
              satsMode={satsMode}
              address={address}
              assetSearch={assetSearch}
              debouncedAsset={debouncedAsset}
              onAssetSearch={setAssetSearch}
              sellerFilter={sellerFilter}
              onFilterSeller={setSellerFilter}
              onClearSeller={() => setSellerFilter(null)}
              sort={sort}
              onSort={setSort}
            />
          </div>
          <Pagination total={total} offset={offset} limit={50} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function SwapTable({ tab, listings, isLoading, satsMode, address, assetSearch, debouncedAsset, onAssetSearch, sellerFilter, onFilterSeller, onClearSeller, sort, onSort }: {
  tab: Tab
  listings: SwapListing[]
  isLoading: boolean
  satsMode: boolean
  address: string | null
  assetSearch: string
  debouncedAsset: string
  onAssetSearch: (v: string) => void
  sellerFilter: string | null
  onFilterSeller: (addr: string) => void
  onClearSeller: () => void
  sort: SortKey
  onSort: (s: SortKey) => void
}) {
  const cols = tab === 'filled' ? 9 : 8
  const isExactMatch = debouncedAsset && listings.length > 0 && listings.every(l => l.asset === debouncedAsset.toUpperCase())
  const [showAddrInput, setShowAddrInput] = useState(false)
  const [addrDraft, setAddrDraft] = useState('')
  const addrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addrRef.current && !addrRef.current.contains(e.target as Node)) setShowAddrInput(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function cyclePriceSort() {
    if (sort === 'price_asc') onSort('price_desc')
    else onSort('price_asc')
  }

  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-3 py-0.5 min-w-0">
            <span className="relative flex items-center">
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => onAssetSearch(e.target.value)}
                placeholder="Asset"
                className="w-full px-1.5 py-0.5 pr-5 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 uppercase"
              />
              {assetSearch && (
                <button onClick={() => onAssetSearch('')} className="absolute right-1 text-zinc-600 hover:text-zinc-300 transition-colors text-[10px]">&times;</button>
              )}
            </span>
          </th>
          <th className="text-right font-normal px-3 py-1.5">Quantity</th>
          <th className="text-right font-normal px-3 py-1.5">
            <button
              onClick={cyclePriceSort}
              className="inline-flex items-center gap-0.5 cursor-pointer hover:text-zinc-300"
            >
              {satsMode ? 'Price (sats)' : 'Price (BTC)'}
              {sort === 'price_asc' && <span className="text-zinc-300">&#9650;</span>}
              {sort === 'price_desc' && <span className="text-zinc-300">&#9660;</span>}
            </button>
          </th>
          <th className="text-right font-normal px-3 py-1.5">{satsMode ? 'Unit (sats)' : 'Unit (BTC)'}</th>
          <th className="text-left font-normal px-3 py-1.5">
            <div className="relative inline-flex items-center gap-1" ref={addrRef}>
              <span>Seller</span>
              {sellerFilter ? (
                <button onClick={onClearSeller} className="text-zinc-300 hover:text-zinc-100 transition-colors">
                  <RiCloseLine className="w-3 h-3" />
                </button>
              ) : (
                <>
                  <button onClick={() => { setShowAddrInput(v => !v); setAddrDraft('') }} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RiFilter3Line className="w-3 h-3" />
                  </button>
                  {showAddrInput && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-sm shadow-lg p-1.5">
                      <form onSubmit={(e) => { e.preventDefault(); if (addrDraft.trim()) { onFilterSeller(addrDraft.trim()); setShowAddrInput(false) } }}>
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
          {tab === 'filled' && <th className="text-left font-normal px-3 py-1.5">Buyer</th>}
          <th className="text-right font-normal px-3 py-1.5">{tab === 'filled' ? 'Filled' : 'Listed'}</th>
          <th className="text-right font-normal px-3 py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        {isLoading || listings.length === 0 ? (
          <EmptyRows loading={isLoading} label={tab === 'filled' ? 'filled swaps' : 'swap listings'} cols={cols} />
        ) : (
          listings.map((listing) => {
            // Fee-inclusive prices (mirrors server: max(2%, 1000 sats))
            const fee = Math.max(Math.floor(listing.price_sats * 0.02), 1000)
            const totalSats = listing.price_sats + fee
            const unitPrice = totalSats / listing.asset_quantity
            const unitPriceBtc = unitPrice / 1e8
            const totalPriceBtc = totalSats / 1e8
            const ts = listing.created_at ? new Date(listing.created_at + 'Z').getTime() / 1000 : 0

            return (
              <tr
                key={listing.id}
                className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0"
              >
                <td className="text-zinc-500 font-mono px-3 py-1.5">
                  {ts > 0 ? compactTime(ts) : '—'}
                </td>
                <td className="px-3 py-1.5">
                  {isExactMatch ? (
                    <Link href={`/swap/${listing.asset}`} className="flex items-center gap-1.5 hover:underline">
                      <Image
                        src={`${XCP_IMG_BASE}/icon/${listing.asset}`}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-sm"
                        unoptimized
                      />
                      <span className="text-zinc-200 truncate">
                        {listing.asset_longname ?? listing.asset}
                      </span>
                    </Link>
                  ) : (
                    <button onClick={() => onAssetSearch(listing.asset)} className="flex items-center gap-1.5 hover:underline text-left">
                      <Image
                        src={`${XCP_IMG_BASE}/icon/${listing.asset}`}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-sm"
                        unoptimized
                      />
                      <span className="text-zinc-200 truncate">
                        {listing.asset_longname ?? listing.asset}
                      </span>
                    </button>
                  )}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatAmount(listing.asset_quantity)}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {satsMode
                    ? totalSats.toLocaleString()
                    : formatPrice(totalPriceBtc, false)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                  {satsMode
                    ? unitPrice < 1
                      ? unitPrice.toPrecision(2)
                      : Math.round(unitPrice).toLocaleString()
                    : formatPrice(unitPriceBtc, false)}
                </td>
                <td className="text-left font-mono px-3 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">{formatAddress(listing.seller_address)}</span>
                    {!sellerFilter && (
                      <button
                        onClick={() => onFilterSeller(listing.seller_address)}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Filter by this seller"
                      >
                        <RiFilter3Line className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                </td>
                {tab === 'filled' && (
                  <td className="text-left text-zinc-500 font-mono px-3 py-1.5">
                    {listing.buyer_address ? formatAddress(listing.buyer_address) : '—'}
                  </td>
                )}
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                  {ts > 0 ? compactTime(ts) : '—'}
                </td>
                <td className="text-right px-3 py-1.5">
                  {listing.status === 'active' && address && address !== listing.seller_address && (
                    <Link
                      href={`/swap/buy/${listing.id}`}
                      className="bg-zinc-800/50 rounded-sm px-1.5 py-0.5 hover:bg-zinc-700/50 transition-colors text-green-400 font-medium"
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
  )
}
