'use client'

import { useState } from 'react'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { DispensersEmpty } from '@/components/dispensers-empty'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import type { Dispense } from '@/types/trading'

type TabKey = 'dispenses' | 'holders' | 'markets' | 'dispensers'

const TAB_LABELS: Record<TabKey, string> = {
  dispenses: 'Dispenses',
  holders: 'Holders',
  markets: 'Markets',
  dispensers: 'Dispensers',
}

interface DispenserDataTabsProps {
  asset: string
  totalSupply: number
  dispenses: Dispense[]
  dispensesLoading: boolean
}

export function DispenserDataTabs({ asset, totalSupply, dispenses, dispensesLoading }: DispenserDataTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dispenses')

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {(['dispenses', 'holders', 'markets', 'dispensers'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-zinc-100 border-b-2 border-green-500'
                : 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="h-[340px] overflow-y-auto">
        {activeTab === 'dispenses' && (
          <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />
        )}
        {activeTab === 'holders' && <HoldersTable asset={asset} totalSupply={totalSupply} />}
        {activeTab === 'markets' && <MarketsTable asset={asset} />}
        {activeTab === 'dispensers' && <DispensersEmpty />}
      </div>
    </>
  )
}

export function DispensesTable({ dispenses, isLoading }: { dispenses: Dispense[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-500">Loading dispenses...</span>
      </div>
    )
  }

  if (dispenses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-600">No recent dispenses</span>
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-950 z-10">
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5">Qty</th>
          <th className="text-right font-normal px-2 py-1.5">BTC Paid</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Buyer</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Seller</th>
          <th className="text-right font-normal px-2 py-1.5">Time</th>
        </tr>
      </thead>
      <tbody>
        {dispenses.map((d) => (
          <tr
            key={`${d.tx_hash}-${d.dispense_index}`}
            className="hover:bg-zinc-900 cursor-default"
          >
            <td className="text-green-400 font-mono px-2 py-1">{d.dispense_quantity_normalized}</td>
            <td className="text-right text-zinc-300 font-mono px-2 py-1">{d.btc_amount_normalized}</td>
            <td className="text-right text-zinc-500 font-mono px-2 py-1 max-sm:hidden">{formatAddress(d.destination)}</td>
            <td className="text-right text-zinc-500 font-mono px-2 py-1 max-sm:hidden">{formatAddress(d.source)}</td>
            <td className="text-right text-zinc-600 font-mono px-2 py-1">
              {d.block_time ? formatTimeAgo(d.block_time) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
