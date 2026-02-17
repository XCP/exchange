'use client'

import { useState } from 'react'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { DispensersEmpty } from '@/components/dispensers-empty'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { useSatsMode } from '@/lib/sats-context'
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
  const { satsMode } = useSatsMode()
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
          <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} asset={asset} />
        )}
        {activeTab === 'holders' && <HoldersTable asset={asset} totalSupply={totalSupply} />}
        {activeTab === 'markets' && <MarketsTable asset={asset} />}
        {activeTab === 'dispensers' && <DispensersEmpty />}
      </div>
    </>
  )
}

function compactTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

export function DispensesTable({ dispenses, isLoading, asset }: { dispenses: Dispense[]; isLoading: boolean; asset?: string }) {
  const { satsMode } = useSatsMode()
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
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-zinc-950 z-10">
          <tr className="text-zinc-600">
            <th className="text-left font-normal px-2 py-1.5 w-10">Time</th>
            <th className="text-right font-normal px-2 py-1.5">Price</th>
            <th className="text-right font-normal px-2 py-1.5">{asset ?? 'Qty'}</th>
            <th className="text-right font-normal px-2 py-1.5">{satsMode ? 'Sats' : 'BTC'}</th>
            <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Buyer</th>
            <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Seller</th>
            <th className="font-normal px-2 py-1.5 w-6 max-sm:hidden"><span className="sr-only">Tx</span></th>
          </tr>
        </thead>
        <tbody>
          {dispenses.map((d) => {
            const qty = parseFloat(d.dispense_quantity_normalized)
            const btc = parseFloat(d.btc_amount_normalized)
            const price = qty > 0 ? btc / qty : 0
            return (
              <tr
                key={`${d.tx_hash}-${d.dispense_index}`}
                className="hover:bg-zinc-900 cursor-default"
              >
                <td className="text-zinc-600 font-mono px-2 py-px">
                  {d.block_time ? compactTime(d.block_time) : '—'}
                </td>
                <td className="text-right text-zinc-300 font-mono px-2 py-px">
                  {formatPrice(price, satsMode)}
                </td>
                <td className="text-right text-green-400 font-mono px-2 py-px">
                  {formatPrice(qty)}
                </td>
                <td className="text-right text-zinc-400 font-mono px-2 py-px">
                  {formatPrice(btc, satsMode)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(d.destination)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(d.source)}
                </td>
                <td className="text-center px-2 py-px max-sm:hidden">
                  <a
                    href={`https://xcp.io/tx/${d.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                    title="View transaction"
                  >
                    ↗
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
