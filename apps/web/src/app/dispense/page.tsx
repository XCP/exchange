'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGlobalDispensers, useGlobalDispenses } from '@/lib/hooks/useGlobalDispensers'
import { formatAddress } from '@/utils/format-address'
import { formatAmountTrade } from '@/utils/format-amount-trade'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

type Tab = 'dispensers' | 'dispenses'

export default function DispensersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dispensers')
  const { dispensers, isLoading: dispensersLoading } = useGlobalDispensers(50)
  const { dispenses, isLoading: dispensesLoading } = useGlobalDispenses(50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Dispensers</h1>
          <p className="text-xs text-zinc-500">Vending machines for Counterparty assets — send BTC, receive tokens</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4">
          {(['dispensers', 'dispenses'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                activeTab === tab
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {tab === 'dispensers' ? 'Open Dispensers' : 'Recent Dispenses'}
            </button>
          ))}
        </div>

        {activeTab === 'dispensers' ? (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            {/* Dispensers header */}
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
        ) : (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            {/* Dispenses header */}
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
