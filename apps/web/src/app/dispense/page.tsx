'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGlobalDispensers, useGlobalDispenses } from '@/lib/hooks/useGlobalDispensers'
import { useDispenserMarkets, type DispenserMarketEntry } from '@/lib/hooks/useDispenserMarkets'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { formatPrice } from '@/utils/format-price'
import { formatAmount } from '@/utils/format-amount'
import { XCP_IMG_BASE } from '@/utils/constants'

type Tab = 'markets' | 'dispensers' | 'dispenses'
type Timeframe = '24h' | '7d' | '30d' | 'all'

function pctColor(v: number | null) {
  if (v == null || v === 0) return 'text-zinc-600'
  return v > 0 ? 'text-green-400' : 'text-red-400'
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  if (v === 0) return '0.0%'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function fmtVol(v: number | null) {
  if (v == null || v <= 0) return '—'
  return formatAmount(v)
}

function tfVal(m: DispenserMarketEntry, prefix: string, tf: Timeframe): number | null {
  if (tf === 'all') return null
  const key = `${prefix}_${tf}` as keyof DispenserMarketEntry
  return (m[key] as number | null) ?? null
}

function defaultDispSort(tf: Timeframe): string {
  return tf === 'all' ? 'total_btc_spent' : `volume_${tf}`
}

function dispSortCol(id: string, tf: Timeframe): string {
  switch (id) {
    case 'price': return 'cheapest_price'
    case 'pct': return tf === 'all' ? 'total_btc_spent' : `price_change_${tf}`
    case 'vol': return tf === 'all' ? 'total_btc_spent' : `volume_${tf}`
    case 'disp': return tf === 'all' ? 'total_dispense_count' : `dispense_count_${tf}`
    case 'buyers': return 'unique_buyers'
    case 'dispensers': return 'active_dispensers'
    case 'depth': return 'total_available'
    default: return defaultDispSort(tf)
  }
}

export default function DispensersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('markets')
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [timeframe, setTimeframe] = useState<Timeframe>('24h')
  const [sortId, setSortId] = useState('vol')
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(1)

  const apiSort = dispSortCol(sortId, timeframe)
  const { markets, total, totalPages, summary, isLoading: marketsLoading } = useDispenserMarkets(apiSort, !hideLowQuality, timeframe, sortDesc ? 'desc' : 'asc', page)
  const { dispensers, isLoading: dispensersLoading } = useGlobalDispensers(50)
  const { dispenses, isLoading: dispensesLoading } = useGlobalDispenses(50)

  const rolling = timeframe !== 'all'

  function handleSort(id: string) {
    if (sortId === id) {
      setSortDesc(!sortDesc)
    } else {
      setSortId(id)
      setSortDesc(id !== 'price')
    }
    setPage(1)
  }

  function SortHeader({ id, label, className }: { id: string; label: string; className?: string }) {
    const active = sortId === id
    return (
      <th
        className={`font-normal px-3 py-2.5 cursor-pointer select-none hover:text-zinc-300 transition-colors ${className ?? 'text-right'} ${active ? 'text-zinc-300' : 'text-zinc-500'}`}
        onClick={() => handleSort(id)}
      >
        {label}{active ? (sortDesc ? ' ▾' : ' ▴') : ''}
      </th>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Dispensers</h1>
          <p className="text-xs text-zinc-500">Vending machines for Counterparty assets — send BTC, receive tokens</p>
        </div>

        {summary && (
          <div className="flex items-center gap-6 mb-4 text-xs">
            <div>
              <span className="text-zinc-500">Open Dispensers</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.total_dispensers.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">Total Dispenses</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.total_dispenses.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">BTC Volume</span>{' '}
              <span className="text-zinc-300 font-mono">{formatPrice(summary.total_btc_volume)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Unique Buyers</span>{' '}
              <span className="text-zinc-300 font-mono">{summary.unique_buyers?.toLocaleString() ?? '—'}</span>
            </div>
            <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideLowQuality}
                onChange={(e) => setHideLowQuality(e.target.checked)}
                className="accent-zinc-500 w-3 h-3"
              />
              <span className="text-zinc-500">Hide low quality</span>
            </label>
          </div>
        )}

        {/* Tab bar + timeframe selector */}
        <div className="flex items-center gap-1 mb-4">
          {([
            ['markets', 'Dispenser Markets'],
            ['dispensers', 'New Dispensers'],
            ['dispenses', 'Recent Dispenses'],
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
          {activeTab === 'markets' && (
            <div className="ml-auto flex gap-0.5">
              {(['24h', '7d', '30d', 'all'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => { setTimeframe(tf); setSortId('vol'); setSortDesc(true); setPage(1) }}
                  className={`px-2 py-1 text-xs font-mono rounded-sm transition-colors ${
                    timeframe === tf
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {tf === 'all' ? 'All' : tf}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeTab === 'markets' && (<>
          <div className="border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left font-normal px-3 py-2.5 sticky left-0 bg-zinc-900/50 z-10">Asset</th>
                  <SortHeader id="price" label="Price" />
                  <th className="text-right font-normal px-3 py-2.5">Last Price</th>
                  {rolling ? (
                    <>
                      <SortHeader id="pct" label={`${timeframe} %`} />
                      <SortHeader id="vol" label={`${timeframe} Vol`} />
                      <SortHeader id="disp" label={`${timeframe} Disp`} />
                    </>
                  ) : (
                    <>
                      <SortHeader id="vol" label="Total BTC" />
                      <SortHeader id="disp" label="Dispenses" />
                      <SortHeader id="buyers" label="Buyers" />
                    </>
                  )}
                  <SortHeader id="dispensers" label="Dispensers" />
                  <SortHeader id="depth" label="Depth" />
                  <th className="text-right font-normal px-3 py-2.5">Last Disp</th>
                </tr>
              </thead>
              <tbody>
                {marketsLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-20 text-sm text-zinc-500">
                      Loading dispenser markets...
                    </td>
                  </tr>
                ) : markets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-20 text-sm text-zinc-600">
                      No active dispenser markets found
                    </td>
                  </tr>
                ) : (
                  markets.map((m) => (
                    <tr key={m.asset} className="hover:bg-zinc-900 transition-colors border-b border-zinc-800/50 last:border-0">
                      <td className="px-3 py-2 sticky left-0 bg-zinc-950 z-10">
                        <Link href={`/dispense/${m.asset}`} className="flex items-center gap-2">
                          <Image
                            src={`${XCP_IMG_BASE}/icon/${m.asset}`}
                            alt=""
                            width={16}
                            height={16}
                            className="rounded-sm"
                            unoptimized
                          />
                          <span className="text-zinc-200 font-medium hover:underline">{m.asset_longname ?? m.asset}</span>
                        </Link>
                      </td>
                      <td className="text-right text-zinc-300 font-mono px-3 py-2">{m.cheapest_price != null ? formatPrice(m.cheapest_price) : '—'}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{m.last_dispense_price != null ? formatPrice(m.last_dispense_price) : '—'}</td>
                      {rolling ? (
                        <>
                          <td className={`text-right font-mono px-3 py-2 ${pctColor(tfVal(m, 'price_change', timeframe))}`}>{fmtPct(tfVal(m, 'price_change', timeframe))}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{fmtVol(tfVal(m, 'volume', timeframe))}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{tfVal(m, 'dispense_count', timeframe) ?? 0}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{m.total_btc_spent != null && m.total_btc_spent > 0 ? formatPrice(m.total_btc_spent) : '—'}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{m.total_dispense_count ?? 0}</td>
                          <td className="text-right text-zinc-400 font-mono px-3 py-2">{m.unique_buyers ?? 0}</td>
                        </>
                      )}
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{m.active_dispensers}</td>
                      <td className="text-right text-zinc-400 font-mono px-3 py-2">{m.total_available != null && m.total_available > 0 ? formatAmount(m.total_available) : '—'}</td>
                      <td className="text-right text-zinc-600 font-mono px-3 py-2">{m.last_dispense_time ? formatTimeAgo(m.last_dispense_time) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-zinc-500">{total.toLocaleString()} assets</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded-sm font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 py-1 rounded-sm font-mono transition-colors ${
                      page === p
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded-sm font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>)}

        {activeTab === 'dispensers' && (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-4">
              <span>Asset</span>
              <span className="text-right">BTC Price</span>
              <span className="text-right">Per Dispense</span>
              <span className="text-right max-sm:hidden">Remaining</span>
              <span className="text-right max-sm:hidden">Source</span>
              <span className="text-right">Time</span>
            </div>

            {dispensersLoading ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-500">Loading dispensers...</span>
              </div>
            ) : dispensers.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-600">No open dispensers found</span>
              </div>
            ) : (
              <div>
                {dispensers.map((d) => {
                  const assetName = d.asset_info?.asset_longname ?? d.asset
                  return (
                    <Link
                      key={d.tx_hash}
                      href={`/dispense/${d.asset}`}
                      className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-4"
                    >
                      <span className="flex items-center gap-2">
                        <Image
                          src={`${XCP_IMG_BASE}/icon/${d.asset}`}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-sm"
                          unoptimized
                        />
                        <span className="text-zinc-200 font-medium truncate">{assetName}</span>
                      </span>
                      <span className="text-right text-zinc-300 font-mono">{d.satoshi_price_normalized}</span>
                      <span className="text-right text-zinc-400 font-mono">{d.give_quantity_normalized}</span>
                      <span className="text-right text-zinc-400 font-mono max-sm:hidden">{d.give_remaining_normalized}</span>
                      <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAddress(d.source)}</span>
                      <span className="text-right text-zinc-600 font-mono">
                        {d.block_time ? formatTimeAgo(d.block_time) : '—'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'dispenses' && (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-4">
              <span>Asset</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">BTC Paid</span>
              <span className="text-right max-sm:hidden">Buyer</span>
              <span className="text-right max-sm:hidden">Seller</span>
              <span className="text-right">Time</span>
            </div>

            {dispensesLoading ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-500">Loading dispenses...</span>
              </div>
            ) : dispenses.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-zinc-600">No recent dispenses found</span>
              </div>
            ) : (
              <div>
                {dispenses.map((d) => {
                  const assetName = d.asset_info?.asset_longname ?? d.asset
                  return (
                    <Link
                      key={`${d.tx_hash}-${d.dispense_index}`}
                      href={`/dispense/${d.asset}`}
                      className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-4"
                    >
                      <span className="flex items-center gap-2">
                        <Image
                          src={`${XCP_IMG_BASE}/icon/${d.asset}`}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-sm"
                          unoptimized
                        />
                        <span className="text-zinc-200 font-medium truncate">{assetName}</span>
                      </span>
                      <span className="text-right text-green-400 font-mono">{d.dispense_quantity_normalized}</span>
                      <span className="text-right text-zinc-300 font-mono">{d.btc_amount_normalized}</span>
                      <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAddress(d.destination)}</span>
                      <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAddress(d.source)}</span>
                      <span className="text-right text-zinc-600 font-mono">
                        {d.block_time ? formatTimeAgo(d.block_time) : '—'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
