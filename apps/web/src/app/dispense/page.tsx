'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { RiFilter3Line } from 'react-icons/ri'
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
            value={dispenseSummary ? formatBig(dispenseSummary.tf_volume) + ` ${btcLabel.toUpperCase()}` : '\u2014'}
            sub={dispenseSummary && dispenseSummary.tf_dispenses > 0 ? `Avg: ${formatBig(dispenseSummary.tf_volume / dispenseSummary.tf_dispenses)} ${btcLabel.toUpperCase()}` : undefined}
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
              {sourceFilter ? (
                <span className="flex-1 min-w-0 inline-flex items-center gap-1.5 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                  {sourceFilter}
                  <button onClick={() => { setSourceFilter(null); handleTagChange(null) }} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
                </span>
              ) : (
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
              )}
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
          </div>
          {/* Desktop: single row */}
          <div className="hidden sm:flex px-3 py-2 items-center gap-2">
            {sourceFilter ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-px text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300">
                {sourceFilter}
                <button onClick={() => { setSourceFilter(null); handleTagChange(null) }} className="text-zinc-500 hover:text-zinc-200 transition-colors">&times;</button>
              </span>
            ) : (
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
          {isDispensesTab ? (
            <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />
          ) : (
            <DispensersTable dispensers={dispensers} isLoading={dispensersLoading} assetSearch={assetSearch} onAssetSearch={setAssetSearch} onFilterAddress={(addr) => { setSourceFilter(addr); handleTagChange(null) }} sort={sort} onSort={setSort} satsMode={satsMode} />
          )}
          <Pagination total={activeTotal} offset={offset} limit={250} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function SortHeader({ label, sortKey, currentSort, onSort, className }: {
  label: string; sortKey: string; currentSort: string | null; onSort: (s: string | null) => void; className?: string
}) {
  const isActive = currentSort === sortKey || currentSort === `${sortKey}_desc`
  const isDesc = currentSort === `${sortKey}_desc`
  const arrow = isActive ? (isDesc ? ' ↓' : ' ↑') : ''
  return (
    <th
      className={`font-normal px-3 py-1.5 cursor-pointer select-none hover:text-zinc-300 transition-colors ${className ?? ''} ${isActive ? 'text-zinc-300' : ''}`}
      onClick={() => {
        if (!isActive) onSort(sortKey)
        else if (!isDesc) onSort(`${sortKey}_desc`)
        else onSort(null)
      }}
    >
      {label}{arrow}
    </th>
  )
}

function DispensersTable({ dispensers, isLoading, assetSearch, onAssetSearch, onFilterAddress, sort, onSort, satsMode }: {
  dispensers: LatestDispenser[]
  isLoading: boolean
  assetSearch: string
  onAssetSearch: (v: string) => void
  onFilterAddress: (addr: string) => void
  sort: string | null
  onSort: (s: string | null) => void
  satsMode: boolean
}) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
          <th className="text-right font-normal px-3 py-1.5">Amount</th>
          <th className="text-left font-normal px-3 py-0.5">
            <span className="relative flex items-center">
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => onAssetSearch(e.target.value)}
                placeholder="Asset"
                className="w-full px-1.5 py-0.5 pr-5 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
              {assetSearch && (
                <button onClick={() => onAssetSearch('')} className="absolute right-1 text-zinc-600 hover:text-zinc-300 transition-colors text-[10px]">&times;</button>
              )}
            </span>
          </th>
          <SortHeader label="Price" sortKey="price" currentSort={sort} onSort={onSort} className="text-right" />
          <th className="px-3 py-1.5 w-0" />
          <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Total</th>
          <th className="text-left font-normal px-3 py-1.5 max-sm:hidden">Address</th>
          <th className="text-left font-normal px-3 py-1.5 max-sm:hidden">Status</th>
          <SortHeader label="Dispensed" sortKey="dispenses" currentSort={sort} onSort={onSort} className="text-right max-sm:hidden" />
        </tr>
      </thead>
      <tbody>
        {isLoading || dispensers.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispensers" cols={9} />
        ) : (
          dispensers.map((d) => {
            const isOpen = d.status < 10
            const displayAmount = isOpen ? d.give_remaining : d.give_quantity
            const total = d.price * displayAmount
            const status = statusLabel(d.status)

            return (
              <tr key={d.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-500 font-mono px-3 py-1.5">
                  {d.block_time ? compactTime(d.block_time) : '—'}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(displayAmount)}
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{d.asset}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(d.price, satsMode)}
                </td>
                <td className="px-1 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <Image src={`${XCP_IMG_BASE}/icon/BTC`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-500 text-[10px]">{satsMode ? 'sats' : 'BTC'}</span>
                  </span>
                </td>
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5 max-sm:hidden">
                  {formatPrice(total, satsMode)}
                </td>
                <td className="text-left font-mono px-3 py-1.5 max-sm:hidden">
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
                <td className={`text-left font-mono px-3 py-1.5 max-sm:hidden capitalize ${isOpen ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {status}
                </td>
                <td className="text-right text-zinc-500 font-mono px-3 py-1.5 max-sm:hidden">
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

function DispensesTable({ dispenses, isLoading }: { dispenses: LatestDispense[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-3 py-1.5">Asset</th>
          <th className="text-right font-normal px-3 py-1.5">Price</th>
          <th className="text-right font-normal px-3 py-1.5">Qty</th>
          <th className="text-left font-normal px-3 py-1.5 max-sm:hidden">Buyer</th>
          <th className="text-left font-normal px-3 py-1.5 max-sm:hidden">Seller</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || dispenses.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispenses" cols={6} />
        ) : (
          dispenses.map((d) => (
            <tr key={`${d.tx_hash}-${d.dispense_index}`} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
              <td className="text-zinc-500 font-mono px-3 py-1.5">
                {d.block_time ? compactTime(d.block_time) : '—'}
              </td>
              <td className="px-3 py-1.5">
                <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline">
                  <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                  <span className="text-zinc-200 truncate">{d.asset}</span>
                </Link>
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                {isFinite(d.price) && d.price > 0 ? formatPrice(d.price) : '—'}
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                {formatPrice(d.dispense_quantity)}
              </td>
              <td className="text-left text-zinc-500 font-mono px-3 py-1.5 max-sm:hidden">
                {formatAddress(d.destination)}
              </td>
              <td className="text-left text-zinc-500 font-mono px-3 py-1.5 max-sm:hidden">
                {formatAddress(d.source)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
