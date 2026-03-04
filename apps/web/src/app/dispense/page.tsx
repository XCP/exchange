'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { RiFilter3Line, RiCloseLine } from 'react-icons/ri'
import { useDispensersLatest, useDispensesLatest, type LatestDispenser, type LatestDispense } from '@/lib/hooks/useDispensersLatest'
import { useAnalyticsSummary, type Timeframe } from '@/lib/hooks/useAnalytics'
import { useSatsMode } from '@/lib/sats-context'
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

function statusLabel(status: number): string {
  if (status === 10) return 'closed'
  if (status === 11) return 'closing'
  return 'open'
}

type DispenserTab = 'all' | 'open' | 'dispenses' | 'closing' | 'closed'

const TABS: [DispenserTab, string][] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['dispenses', 'Dispensed'],
  ['closing', 'Closing'],
  ['closed', 'Closed'],
]

export default function DispensePage() {
  return <Suspense><DispensePageInner /></Suspense>
}

const TF_OPTIONS = ['24h', '7d', '30d', 'all'] as const
const TF_LABELS: Record<Timeframe, string> = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All' }

function DispensePageInner() {
  const searchParams = useSearchParams()
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const [tab, setTab] = useState<DispenserTab>('open')
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
  const [assetSearch, setAssetSearch] = useState('')
  const [debouncedAsset, setDebouncedAsset] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<string | null>(null)
  const collections = useTags('collection')

  const { dispenseSummary, isLoading: summaryLoading } = useAnalyticsSummary(timeframe, includeHidden, tag)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAsset(assetSearch), 300)
    return () => clearTimeout(timer)
  }, [assetSearch])

  // Default to price low-to-high when filtering, revert to newest when no filters
  const hasFilter = !!debouncedAsset || !!sourceFilter || !!tag
  useEffect(() => {
    if (hasFilter) setSort(s => s ?? 'price')
    else setSort(null)
  }, [hasFilter])

  useEffect(() => {
    setOffset(0)
  }, [tab, tag, debouncedAsset, sourceFilter, sort])

  const dispenserStatus = tab === 'dispenses' ? undefined : tab
  const dispenserFilters = {
    ...(tag ? { tag } : {}),
    ...(dispenserStatus ? { status: dispenserStatus } : {}),
    ...(debouncedAsset ? { asset: debouncedAsset } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(offset > 0 ? { offset } : {}),
    ...(includeHidden ? { includeHidden: true } : {}),
    ...(sort ? { sort } : {}),
  }
  const { dispensers, total: dispensersTotal, isLoading: dispensersLoading } = useDispensersLatest(
    Object.keys(dispenserFilters).length > 0 ? dispenserFilters : undefined, 250
  )
  const dispenseFilters = {
    ...(tag ? { tag } : {}),
    ...(debouncedAsset ? { asset: debouncedAsset } : {}),
    ...(offset > 0 ? { offset } : {}),
    ...(includeHidden ? { includeHidden: true } : {}),
    ...(sort ? { sort } : {}),
  }
  const { dispenses, total: dispensesTotal, isLoading: dispensesLoading } = useDispensesLatest(
    Object.keys(dispenseFilters).length > 0 ? dispenseFilters : undefined, 250
  )

  const isDispensesTab = tab === 'dispenses'
  const activeTotal = isDispensesTab ? dispensesTotal : dispensersTotal

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Dispensers</h1>
            <p className="text-xs text-zinc-500">BTC-to-asset vending machines on Counterparty</p>
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
            label="Dispense Volume"
            loading={summaryLoading}
            value={dispenseSummary ? formatBig(satsMode ? dispenseSummary.tf_volume * 1e8 : dispenseSummary.tf_volume) + ` ${btcLabel.toUpperCase()}` : '\u2014'}
            sub={dispenseSummary && dispenseSummary.tf_dispenses > 0 ? `Avg: ${formatBig(satsMode ? (dispenseSummary.tf_volume / dispenseSummary.tf_dispenses) * 1e8 : dispenseSummary.tf_volume / dispenseSummary.tf_dispenses)} ${btcLabel.toUpperCase()}` : undefined}
          />
          <CounterCard
            label="Dispensers Created"
            loading={summaryLoading}
            value={dispenseSummary ? dispenseSummary.tf_dispensers_created.toLocaleString() : '\u2014'}
            sub={dispenseSummary ? `${dispenseSummary.open_dispensers.toLocaleString()} open` : undefined}
          />
          <CounterCard
            label="Dispenses"
            loading={summaryLoading}
            value={dispenseSummary ? dispenseSummary.tf_dispenses.toLocaleString() : '\u2014'}
            sub={dispenseSummary?.tf_unique_buyers ? `${dispenseSummary.tf_unique_buyers.toLocaleString()} addresses` : undefined}
          />
          <CounterCard
            label="Active Dispensers"
            loading={summaryLoading}
            value={dispenseSummary ? dispenseSummary.active_assets.toLocaleString() : '\u2014'}
            sub={dispenseSummary ? (timeframe === 'all' ? `${dispenseSummary.total_assets.toLocaleString()} total` : dispenseSummary.new_assets ? `${dispenseSummary.new_assets.toLocaleString()} new` : undefined) : undefined}
          />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          {/* Mobile: side-by-side dropdowns */}
          <div className="sm:hidden px-3 py-2 flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                value={tag ?? ''}
                onChange={(e) => handleTagChange(e.target.value || null)}
                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
              >
                <option value="">All Dispensers</option>
                {collections.filter(c => c.open_dispensers_count > 0).map(c => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} ({c.open_dispensers_count})
                  </option>
                ))}
              </select>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as DispenserTab)}
                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
              >
                {TABS.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {sourceFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                {sourceFilter}
                <button onClick={() => setSourceFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
              </span>
            )}
          </div>
          {/* Desktop: single row */}
          <div className="hidden sm:flex px-3 py-2 items-center gap-2">
            <select
              value={tag ?? ''}
              onChange={(e) => handleTagChange(e.target.value || null)}
              className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
            >
              <option value="">All Dispensers</option>
              {collections.filter(c => c.open_dispensers_count > 0).map(c => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.open_dispensers_count})
                </option>
              ))}
            </select>
            {sourceFilter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-px text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                {sourceFilter}
                <button onClick={() => setSourceFilter(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
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
          {isDispensesTab ? (
            <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} satsMode={satsMode} assetSearch={assetSearch} debouncedAsset={debouncedAsset} onAssetSearch={setAssetSearch} onFilterAddress={(addr) => { setSourceFilter(addr) }} sourceFilter={sourceFilter} onClearAddress={() => setSourceFilter(null)} sort={sort} onSort={setSort} hasFilter={hasFilter} />
          ) : (
            <DispensersTable dispensers={dispensers} isLoading={dispensersLoading} assetSearch={assetSearch} debouncedAsset={debouncedAsset} onAssetSearch={setAssetSearch} onFilterAddress={(addr) => { setSourceFilter(addr) }} sourceFilter={sourceFilter} onClearAddress={() => setSourceFilter(null)} sort={sort} onSort={setSort} satsMode={satsMode} hasFilter={hasFilter} />
          )}
          </div>
          <Pagination total={activeTotal} offset={offset} limit={250} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function SortHeader({ label, sortKey, currentSort, onSort, disabled, className }: {
  label: string; sortKey: string; currentSort: string | null; onSort: (s: string | null) => void; disabled?: boolean; className?: string
}) {
  const isActive = currentSort === sortKey || currentSort === `${sortKey}_desc`
  const isDesc = currentSort === `${sortKey}_desc`
  const arrow = isActive ? (isDesc ? ' ↓' : ' ↑') : ''
  return (
    <th
      className={`font-normal px-3 py-1.5 select-none transition-colors ${className ?? ''} ${disabled ? 'cursor-default' : 'cursor-pointer hover:text-zinc-300'} ${isActive ? 'text-zinc-300' : ''}`}
      onClick={disabled ? undefined : () => {
        if (!isActive) onSort(sortKey)
        else if (!isDesc) onSort(`${sortKey}_desc`)
        else onSort(null)
      }}
    >
      {label}{arrow}
    </th>
  )
}

function DispensersTable({ dispensers, isLoading, assetSearch, debouncedAsset, onAssetSearch, onFilterAddress, sourceFilter, onClearAddress, sort, onSort, satsMode, hasFilter }: {
  dispensers: LatestDispenser[]
  isLoading: boolean
  assetSearch: string
  debouncedAsset: string
  onAssetSearch: (v: string) => void
  onFilterAddress: (addr: string) => void
  sourceFilter: string | null
  onClearAddress: () => void
  sort: string | null
  onSort: (s: string | null) => void
  satsMode: boolean
  hasFilter: boolean
}) {
  const isExactMatch = debouncedAsset && dispensers.length > 0 && dispensers.every(d => d.asset === debouncedAsset.toUpperCase())
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
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <SortHeader label="Time" sortKey="time" currentSort={sort} onSort={onSort} disabled={!hasFilter} className="text-left w-8" />
          <th className="py-1.5" />
          <SortHeader label="Effective Price" sortKey="price" currentSort={sort} onSort={onSort} disabled={!hasFilter} className="text-right" />
          <th className="py-1.5" />
          <th className="text-right font-normal px-3 py-1.5">Per Dispense</th>
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
          <th className="text-right font-normal px-3 py-1.5">Dispense Cost</th>
          <th className="text-right font-normal px-3 py-1.5">Remaining</th>
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
          <SortHeader label="#" sortKey="dispenses" currentSort={sort} onSort={onSort} disabled={!hasFilter} className="text-right" />
        </tr>
      </thead>
      <tbody>
        {isLoading || dispensers.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispensers" cols={11} />
        ) : (
          dispensers.map((d) => {
            const isOpen = d.status < 10
            const remaining = isOpen ? d.give_remaining : d.give_quantity
            const status = statusLabel(d.status)
            const displayName = d.asset_longname ?? d.asset

            return (
              <tr key={d.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-500 font-mono px-3 py-1.5">
                  {d.block_time ? compactTime(d.block_time) : '—'}
                </td>
                <td className={`font-medium px-3 py-1.5 text-green-400`}>
                  {isOpen ? (
                    <Link
                      href={`/dispense/${encodeURIComponent(d.asset)}?address=${d.source}`}
                      className="bg-zinc-800/50 rounded-sm px-1.5 py-0.5 hover:bg-zinc-700/50 transition-colors"
                    >
                      Buy
                    </Link>
                  ) : null}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(d.price, satsMode)}
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline decoration-zinc-400">
                    <Image src={`${XCP_IMG_BASE}/icon/BTC`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-400 truncate">{satsMode ? 'sats' : 'BTC'}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(d.give_quantity)}
                </td>
                <td className="px-3 py-1.5">
                  {isExactMatch ? (
                    <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{displayName}</span>
                    </Link>
                  ) : (
                    <button onClick={() => onAssetSearch(d.asset)} className="flex items-center gap-1.5 hover:underline text-left">
                      <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{displayName}</span>
                    </button>
                  )}
                </td>
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                  {d.give_quantity > 1 ? formatPrice(d.satoshi_price / 1e8, satsMode) : ''}
                </td>
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                  {formatPrice(remaining)}
                </td>
                <td className="text-left font-mono px-3 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">{formatAddress(d.source)}</span>
                    <button
                      onClick={() => onFilterAddress(d.source)}
                      className="text-zinc-600 hover:text-zinc-400 transition-colors"
                      title="Filter by this address"
                    >
                      <RiFilter3Line className="w-3 h-3" />
                    </button>
                  </span>
                </td>
                <td className={`text-left font-mono px-3 py-1.5 capitalize ${isOpen ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {status}
                </td>
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                  {d.dispense_count}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

function DispensesTable({ dispenses, isLoading, satsMode, assetSearch, debouncedAsset, onAssetSearch, onFilterAddress, sourceFilter, onClearAddress, sort, onSort, hasFilter }: {
  dispenses: LatestDispense[]; isLoading: boolean; satsMode: boolean; assetSearch: string; debouncedAsset: string; onAssetSearch: (v: string) => void
  onFilterAddress: (addr: string) => void; sourceFilter: string | null; onClearAddress: () => void
  sort: string | null; onSort: (s: string | null) => void; hasFilter: boolean
}) {
  const isExactMatch = debouncedAsset && dispenses.length > 0 && dispenses.every(d => d.asset === debouncedAsset.toUpperCase())
  const [showBuyerInput, setShowBuyerInput] = useState(false)
  const [buyerDraft, setBuyerDraft] = useState('')
  const buyerRef = useRef<HTMLDivElement>(null)
  const [showSellerInput, setShowSellerInput] = useState(false)
  const [sellerDraft, setSellerDraft] = useState('')
  const sellerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (buyerRef.current && !buyerRef.current.contains(e.target as Node)) setShowBuyerInput(false)
      if (sellerRef.current && !sellerRef.current.contains(e.target as Node)) setShowSellerInput(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <SortHeader label="Time" sortKey="time" currentSort={sort} onSort={onSort} disabled={!hasFilter} className="text-left w-8" />
          <SortHeader label="Effective Price" sortKey="price" currentSort={sort} onSort={onSort} disabled={!hasFilter} className="text-right" />
          <th className="py-1.5" />
          <th className="text-right font-normal px-3 py-1.5">Dispensed</th>
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
          <th className="text-right font-normal px-3 py-1.5">Total ({satsMode ? 'sats' : 'BTC'})</th>
          <th className="text-left font-normal px-3 py-1.5">
            <div className="relative inline-flex items-center gap-1" ref={buyerRef}>
              <span>Buyer</span>
              {sourceFilter ? (
                <button onClick={onClearAddress} className="text-zinc-300 hover:text-zinc-100 transition-colors">
                  <RiCloseLine className="w-3 h-3" />
                </button>
              ) : (
                <>
                  <button onClick={() => { setShowBuyerInput(v => !v); setBuyerDraft('') }} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RiFilter3Line className="w-3 h-3" />
                  </button>
                  {showBuyerInput && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-sm shadow-lg p-1.5">
                      <form onSubmit={(e) => { e.preventDefault(); if (buyerDraft.trim()) { onFilterAddress(buyerDraft.trim()); setShowBuyerInput(false) } }}>
                        <input
                          autoFocus
                          type="text"
                          value={buyerDraft}
                          onChange={(e) => setBuyerDraft(e.target.value)}
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
          <th className="text-left font-normal px-3 py-1.5">
            <div className="relative inline-flex items-center gap-1" ref={sellerRef}>
              <span>Dispenser</span>
              {sourceFilter ? (
                <button onClick={onClearAddress} className="text-zinc-300 hover:text-zinc-100 transition-colors">
                  <RiCloseLine className="w-3 h-3" />
                </button>
              ) : (
                <>
                  <button onClick={() => { setShowSellerInput(v => !v); setSellerDraft('') }} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RiFilter3Line className="w-3 h-3" />
                  </button>
                  {showSellerInput && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-sm shadow-lg p-1.5">
                      <form onSubmit={(e) => { e.preventDefault(); if (sellerDraft.trim()) { onFilterAddress(sellerDraft.trim()); setShowSellerInput(false) } }}>
                        <input
                          autoFocus
                          type="text"
                          value={sellerDraft}
                          onChange={(e) => setSellerDraft(e.target.value)}
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
        </tr>
      </thead>
      <tbody>
        {isLoading || dispenses.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispenses" cols={8} />
        ) : (
          dispenses.map((d) => {
            const displayName = d.asset_longname ?? d.asset
            return (
            <tr key={`${d.tx_hash}-${d.dispense_index}`} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
              <td className="text-zinc-500 font-mono px-3 py-1.5">
                {d.block_time ? compactTime(d.block_time) : '—'}
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                {(() => {
                  const p = (d.price > 0 && isFinite(d.price)) ? d.price : (d.dispense_quantity > 0 && d.btc_amount > 0) ? d.btc_amount / d.dispense_quantity : 0
                  return p > 0 ? formatPrice(p, satsMode) : '—'
                })()}
              </td>
              <td className="px-3 py-1.5">
                <Link href={`/dispense/${encodeURIComponent(d.asset)}?address=${d.source}`} className="flex items-center gap-1.5 hover:underline decoration-zinc-400">
                  <Image src={`${XCP_IMG_BASE}/icon/BTC`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                  <span className="text-zinc-400 truncate">{satsMode ? 'sats' : 'BTC'}</span>
                </Link>
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                {formatPrice(d.dispense_quantity)}
              </td>
              <td className="px-3 py-1.5">
                {isExactMatch ? (
                  <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{displayName}</span>
                  </Link>
                ) : (
                  <button onClick={() => onAssetSearch(d.asset)} className="flex items-center gap-1.5 hover:underline text-left">
                    <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{displayName}</span>
                  </button>
                )}
              </td>
              <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
                {d.btc_amount > 0 ? formatPrice(d.btc_amount, satsMode) : '—'}
              </td>
              <td className="text-left font-mono px-3 py-1.5">
                <span className="inline-flex items-center gap-1">
                  <span className="text-zinc-500">{formatAddress(d.destination)}</span>
                  <button onClick={() => onFilterAddress(d.destination)} className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Filter by this address">
                    <RiFilter3Line className="w-3 h-3" />
                  </button>
                </span>
              </td>
              <td className="text-left font-mono px-3 py-1.5">
                <span className="inline-flex items-center gap-1">
                  <span className="text-zinc-500">{formatAddress(d.source)}</span>
                  <button onClick={() => onFilterAddress(d.source)} className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Filter by this address">
                    <RiFilter3Line className="w-3 h-3" />
                  </button>
                </span>
              </td>
            </tr>
          )})
        )}
      </tbody>
    </table>
  )
}
