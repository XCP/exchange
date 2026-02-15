'use client'

import { useState } from 'react'
import { TradesList } from '@/components/trades-list'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { OrdersEmpty } from '@/components/orders-empty'

type TabKey = 'trades' | 'holders' | 'markets' | 'orders'

const TAB_LABELS: Record<TabKey, string> = {
  trades: 'Trades',
  holders: 'Holders',
  markets: 'Markets',
  orders: 'Orders',
}

interface DataTabsProps {
  market: string
  baseSymbol: string
  quoteSymbol: string
  baseAsset: string
  totalSupply: number
  currentPair?: string
}

export function DataTabs({ market, baseSymbol, quoteSymbol, baseAsset, totalSupply, currentPair }: DataTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('trades')

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {(['trades', 'holders', 'markets', 'orders'] as const).map((tab) => (
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
        {activeTab === 'trades' && <TradesList market={market} baseSymbol={baseSymbol} quoteSymbol={quoteSymbol} />}
        {activeTab === 'holders' && <HoldersTable asset={baseAsset} totalSupply={totalSupply} />}
        {activeTab === 'markets' && <MarketsTable asset={baseAsset} currentPair={currentPair} />}
        {activeTab === 'orders' && <OrdersEmpty />}
      </div>
    </>
  )
}
