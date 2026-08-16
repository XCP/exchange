'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/wallet-context'
import { PortfolioActivity } from '@/components/portfolio/portfolio-activity'
import { PortfolioOrders } from '@/components/portfolio/portfolio-orders'
import { PortfolioDispensers } from '@/components/portfolio/portfolio-dispensers'
import { PortfolioBalances } from '@/components/portfolio/portfolio-balances'
import { PortfolioUtxos } from '@/components/portfolio/portfolio-utxos'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { BrowseHeader } from '@/components/browse-controls'
import { Tabs, SegmentedList, SegmentedTrigger } from '@/components/ui/tabs'
import { formatAddress } from '@/utils/format-address'

/**
 * Everything one wallet holds, in one place.
 *
 * Restyled onto the site's shared chrome rather than its own: a BrowseHeader
 * like every other listing page, the shared segmented tabs, and tables built
 * from components/ui/data-table. It previously had a bespoke full-bleed
 * header, a hand-rolled tab row and CSS-grid pseudo-tables, which made the
 * same data look like a different product depending on how you arrived.
 *
 * Swaps is gone. The atomic-swap surface is being kept off the front end for
 * now; the routes still exist, nothing links to them.
 *
 * Pools are not a tab here either — an LP token is a share of two other
 * assets, and the number that matters is what it redeems for, which is what
 * /positions is for. This links there rather than answering it badly.
 */
type TabKey = 'activity' | 'orders' | 'dispensers' | 'utxos' | 'balances'

const TABS: [TabKey, string][] = [
  // Activity first: the other tabs are all STATE — what you hold, what is
  // still open — and "what happened" is the question asked most often.
  ['activity', 'Activity'],
  ['orders', 'Orders'],
  ['dispensers', 'Dispensers'],
  ['balances', 'Balances'],
  ['utxos', 'UTXOs'],
]

export default function PortfolioPage() {
  const { status, address, connect, connecting } = useWallet()
  const [activeTab, setActiveTab] = useState<TabKey>('activity')
  const [showInstall, setShowInstall] = useState(false)

  if (status !== 'connected' || !address) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="px-4 py-8">
          <BrowseHeader title="Portfolio" subtitle="Everything this wallet holds on Counterparty" />
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
            <p className="text-sm text-zinc-400">Connect your wallet to view your portfolio.</p>
            <button
              onClick={status === 'disconnected' ? connect : () => setShowInstall(true)}
              disabled={connecting}
              className="mt-4 rounded-sm bg-green-500 px-6 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-green-400 disabled:opacity-50"
            >
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
          {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <BrowseHeader title="Portfolio" subtitle={formatAddress(address)}>
          <Link
            href="/positions"
            className="rounded-sm border border-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
          >
            Liquidity positions →
          </Link>
        </BrowseHeader>

        <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/50">
          <div className="border-b border-zinc-800 p-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
              <SegmentedList className="w-full" tone="inPanel">
                {TABS.map(([key, label]) => (
                  <SegmentedTrigger key={key} value={key}>
                    {label}
                  </SegmentedTrigger>
                ))}
              </SegmentedList>
            </Tabs>
          </div>

          {activeTab === 'activity' && <PortfolioActivity address={address} />}
          {activeTab === 'orders' && <PortfolioOrders address={address} />}
          {activeTab === 'dispensers' && <PortfolioDispensers address={address} />}
          {activeTab === 'balances' && <PortfolioBalances address={address} />}
          {activeTab === 'utxos' && <PortfolioUtxos address={address} />}
        </div>
      </div>
    </div>
  )
}
