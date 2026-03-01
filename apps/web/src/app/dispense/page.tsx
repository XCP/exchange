'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGlobalDispensers, useGlobalDispenses } from '@/lib/hooks/useGlobalDispensers'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { Dispenser, Dispense } from '@/types/trading'

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
      <td colSpan={cols} className="text-center py-10 text-zinc-600 text-xs">
        {loading ? `Loading ${label}...` : `No recent ${label}`}
      </td>
    </tr>
  )
}

export default function DispensePage() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { dispensers, isLoading: dispensersLoading } = useGlobalDispensers(50)
  const { dispenses, isLoading: dispensesLoading } = useGlobalDispenses(50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Dispensers</span>
            <div className="flex gap-0.5 ml-auto">
              {['New', 'Dispenses'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => setTab(i as 0 | 1)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                    tab === i
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tab === 0 ? (
            <DispensersTable dispensers={dispensers} isLoading={dispensersLoading} />
          ) : (
            <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />
          )}
        </div>
      </div>
    </div>
  )
}

function DispensersTable({ dispensers, isLoading }: { dispensers: Dispenser[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
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
          dispensers.map((dispenser) => {
            const assetSymbol = dispenser.asset_info?.asset_longname ?? dispenser.asset

            return (
              <tr key={dispenser.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-600 font-mono px-3 py-1.5">
                  {dispenser.block_time ? compactTime(dispenser.block_time) : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/dispense/${encodeURIComponent(assetSymbol)}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${dispenser.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{assetSymbol}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(dispenser.satoshirate_normalized)}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(dispenser.give_remaining_normalized)}
                </td>
                <td className="text-left text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                  {formatAddress(dispenser.source)}
                </td>
                <td className="text-right text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                  {dispenser.dispense_count}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

function DispensesTable({ dispenses, isLoading }: { dispenses: Dispense[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
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
          dispenses.map((dispense) => {
            const assetSymbol = dispense.asset_info?.asset_longname ?? dispense.asset
            const qty = parseFloat(dispense.dispense_quantity_normalized)
            const price = qty > 0 ? parseFloat(dispense.btc_amount_normalized) / qty : 0

            return (
              <tr key={`${dispense.tx_hash}-${dispense.dispense_index}`} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-600 font-mono px-3 py-1.5">
                  {dispense.block_time ? compactTime(dispense.block_time) : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/dispense/${encodeURIComponent(assetSymbol)}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${dispense.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{assetSymbol}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {isFinite(price) && price > 0 ? formatPrice(price) : '—'}
                </td>
                <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
                  {formatPrice(dispense.dispense_quantity_normalized)}
                </td>
                <td className="text-left text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                  {formatAddress(dispense.destination)}
                </td>
                <td className="text-left text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                  {formatAddress(dispense.source)}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
