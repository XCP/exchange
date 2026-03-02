'use client'

import { useState } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { PortfolioOrders } from '@/components/portfolio/portfolio-orders'
import { PortfolioDispensers } from '@/components/portfolio/portfolio-dispensers'
import { PortfolioBalances } from '@/components/portfolio/portfolio-balances'
import { PortfolioSwaps } from '@/components/portfolio/portfolio-swaps'
import { PortfolioUtxos } from '@/components/portfolio/portfolio-utxos'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { formatAddress } from '@/utils/format-address'

type TabKey = 'orders' | 'dispensers' | 'swaps' | 'utxos' | 'balances'

const TAB_LABELS: Record<TabKey, string> = {
  orders: 'Orders',
  dispensers: 'Dispensers',
  swaps: 'Swaps',
  utxos: 'UTXOs',
  balances: 'Balances',
}

export default function PortfolioPage() {
  const { status, address, connect, connecting } = useWallet()
  const [activeTab, setActiveTab] = useState<TabKey>('orders')

  const [showInstall, setShowInstall] = useState(false)

  if (status !== 'connected' || !address) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-lg font-semibold">Portfolio</h1>
          <p className="text-sm text-zinc-500">Connect your wallet to view your portfolio</p>
          <button
            onClick={status === 'disconnected' ? connect : () => setShowInstall(true)}
            disabled={connecting}
            className="rounded-sm bg-green-500 px-6 py-2 text-sm font-semibold text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-mono text-zinc-300">{address}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {(['orders', 'dispensers', 'swaps', 'utxos', 'balances'] as const).map((tab) => (
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
      <div className="mx-auto">
        {activeTab === 'orders' && <PortfolioOrders address={address} />}
        {activeTab === 'dispensers' && <PortfolioDispensers address={address} />}
        {activeTab === 'swaps' && <PortfolioSwaps address={address} />}
        {activeTab === 'utxos' && <PortfolioUtxos address={address} />}
        {activeTab === 'balances' && <PortfolioBalances address={address} />}
      </div>
    </div>
  )
}
