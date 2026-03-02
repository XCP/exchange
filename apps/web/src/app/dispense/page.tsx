'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useDispensersLatest, useDispensesLatest, type LatestDispenser, type LatestDispense } from '@/lib/hooks/useDispensersLatest'
import { useTags } from '@/lib/hooks/useTags'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

function compactTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s`
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

type DispenserTab = 'all' | 'open' | 'dispenses' | 'closing' | 'closed'

const TABS: [DispenserTab, string][] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['dispenses', 'Dispenses'],
  ['closing', 'Closing'],
  ['closed', 'Closed'],
]

export default function DispensePage() {
  const [tab, setTab] = useState<DispenserTab>('open')
  const [tag, setTag] = useState<string | null>(null)
  const collections = useTags('collection')

  const dispenserStatus = tab === 'dispenses' ? undefined : tab
  const dispenserFilters = {
    ...(tag ? { tag } : {}),
    ...(dispenserStatus ? { status: dispenserStatus } : {}),
  }
  const { dispensers, isLoading: dispensersLoading } = useDispensersLatest(
    Object.keys(dispenserFilters).length > 0 ? dispenserFilters : undefined, 50
  )
  const dispenseFilters = tag ? { tag } : undefined
  const { dispenses, isLoading: dispensesLoading } = useDispensesLatest(dispenseFilters, 50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Dispensers</h1>
            <p className="text-xs text-zinc-500">BTC-to-asset vending machines on Counterparty</p>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2 flex items-center gap-2">
            <select
              value={tag ?? ''}
              onChange={(e) => setTag(e.target.value || null)}
              className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
            >
              <option value="">All Dispensers</option>
              {collections.filter(c => c.open_dispensers_count > 0).map(c => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.open_dispensers_count})
                </option>
              ))}
            </select>
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
          {tab === 'dispenses' ? (
            <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />
          ) : (
            <DispensersTable dispensers={dispensers} isLoading={dispensersLoading} />
          )}
        </div>
      </div>
    </div>
  )
}

function DispensersTable({ dispensers, isLoading }: { dispensers: LatestDispenser[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-3 py-1.5">Asset</th>
          <th className="text-right font-normal px-3 py-1.5">Price</th>
          <th className="text-right font-normal px-3 py-1.5">Available</th>
          <th className="text-left font-normal px-3 py-1.5 max-sm:hidden">Address</th>
          <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Dispenses</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || dispensers.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispensers" cols={6} />
        ) : (
          dispensers.map((d) => (
            <tr key={d.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
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
                {formatPrice(d.price)}
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                {formatPrice(d.give_remaining)}
              </td>
              <td className="text-left text-zinc-500 font-mono px-3 py-1.5 max-sm:hidden">
                {formatAddress(d.source)}
              </td>
              <td className="text-right text-zinc-500 font-mono px-3 py-1.5 max-sm:hidden">
                {d.dispense_count}
              </td>
            </tr>
          ))
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
