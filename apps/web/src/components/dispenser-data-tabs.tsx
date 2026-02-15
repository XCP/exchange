'use client'

import { useState } from 'react'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { DispensersEmpty } from '@/components/dispensers-empty'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import type { Dispense, OtherMarket } from '@/types/trading'

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
  otherMarkets: OtherMarket[]
}

export function DispenserDataTabs({ asset, totalSupply, dispenses, dispensesLoading, otherMarkets }: DispenserDataTabsProps) {
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
        {activeTab === 'markets' && <MarketsTable markets={otherMarkets} />}
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
    <div>
      <div className="grid grid-cols-5 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800 max-sm:grid-cols-3">
        <span>Qty</span>
        <span className="text-right">BTC Paid</span>
        <span className="text-right max-sm:hidden">Buyer</span>
        <span className="text-right max-sm:hidden">Seller</span>
        <span className="text-right">Time</span>
      </div>
      <div className="px-1">
        {dispenses.map((d) => (
          <div
            key={`${d.tx_hash}-${d.dispense_index}`}
            className="grid grid-cols-5 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-default max-sm:grid-cols-3"
          >
            <span className="text-green-400 font-mono">{d.dispense_quantity_normalized}</span>
            <span className="text-right text-zinc-300 font-mono">{d.btc_amount_normalized}</span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAddress(d.destination)}</span>
            <span className="text-right text-zinc-500 font-mono max-sm:hidden">{formatAddress(d.source)}</span>
            <span className="text-right text-zinc-600 font-mono">
              {d.block_time ? formatTimeAgo(d.block_time) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
