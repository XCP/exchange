'use client'

import { useState } from 'react'
import { useTradingPairs } from '@/lib/hooks/useTradingPairs'
import { TradingPairsTable } from '@/components/trading-pairs-table'

const MARKETS = ['XCP', 'BTC', 'PEPECASH', 'BITCORN', 'FLDC']

export default function HomePage() {
  const [activeMarket, setActiveMarket] = useState('XCP')
  const { pairs, isLoading } = useTradingPairs(activeMarket)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Markets</h1>
          <p className="text-xs text-zinc-500">Peer-to-peer trading on the Counterparty Decentralized Exchange</p>
        </div>

        {/* Market selector */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto">
          {MARKETS.map((market) => (
            <button
              key={market}
              onClick={() => setActiveMarket(market)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap ${
                activeMarket === market
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {market}
            </button>
          ))}
        </div>

        <TradingPairsTable pairs={pairs} isLoading={isLoading} />
      </div>
    </div>
  )
}
