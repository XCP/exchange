'use client'

import { use, useState } from 'react'
import { useTradingPair } from '@/lib/hooks/useTradingPair'
import { useDispenserStats } from '@/lib/hooks/useDispenserStats'
import { useAssetDispensers, useAssetDispenses } from '@/lib/hooks/useAssetDispensers'
import { DispenserMarketHeader } from '@/components/dispenser-market-header'
import { DispenserDepthChart } from '@/components/dispenser-depth-chart'
import { DispenserModal } from '@/components/dispenser-modal'
import { DispenserDataTabs, DispensesTable } from '@/components/dispenser-data-tabs'
import { DispenseForm } from '@/components/dispense-form'
import { QuickStats } from '@/components/quick-stats'
import { AssetInfo } from '@/components/asset-info'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { DispensersEmpty } from '@/components/dispensers-empty'
import { formatAmount } from '@/utils/format-amount'
import type { Dispenser } from '@/types/trading'

type MobileTabKey = 'dispenses' | 'holders' | 'markets' | 'dispensers'
const MOBILE_TAB_LABELS: Record<MobileTabKey, string> = {
  dispenses: 'Dispenses',
  holders: 'Holders',
  markets: 'Markets',
  dispensers: 'Dispensers',
}

export default function AssetDispensersPage({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = use(params)

  const market = `${asset}/BTC`

  const { data: pairData, isLoading: pairLoading } = useTradingPair(`${asset}_BTC`)
  const { data: dispenserStats, isLoading: statsLoading } = useDispenserStats(asset)
  const { dispensers, isLoading: dispensersLoading } = useAssetDispensers(asset)
  const { dispenses, isLoading: dispensesLoading } = useAssetDispenses(asset)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mobileDataTab, setMobileDataTab] = useState<MobileTabKey>('dispenses')
  const [modalDispenser, setModalDispenser] = useState<Dispenser | null>(null)

  const sortedDispensers = [...dispensers].sort((a, b) => a.price - b.price)

  const handleDispenserClick = (d: Dispenser) => {
    setModalDispenser(d)
  }

  const totalSupply = pairData?.base_asset?.supply ?? 0
  const baseAsset = pairData?.base_asset?.asset ?? asset
  const otherMarkets = pairData?.other_markets ?? []

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Full-width market header (NOT sticky) */}
      <DispenserMarketHeader
        pairData={pairData}
        stats={dispenserStats}
        asset={asset}
        isLoading={pairLoading || statsLoading}
      />

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:min-h-[calc(100vh-37px)] gap-px bg-zinc-800">

        {/* == LEFT Sidebar (desktop only) — Form + Stats + Asset Info == */}
        <div className="hidden lg:flex lg:order-1 col-span-1 lg:col-span-3 bg-zinc-950 flex-col">
          <DispenseForm
            asset={asset}
            sortedDispensers={sortedDispensers}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
          />
          {pairData && <QuickStats pairData={pairData} />}
          {pairData && <AssetInfo pairData={pairData} />}
        </div>

        {/* == MAIN Content Area == */}
        <div className="order-1 lg:order-2 col-span-1 lg:col-span-9 bg-zinc-950 flex flex-col">

          {/* Mobile condensed market info */}
          <div className="lg:hidden flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-zinc-800 text-[10px] font-bold text-green-400">
              {asset.slice(0, 2)}
            </div>
            <span className="text-xs font-semibold text-zinc-100">{market}</span>
            <span className="text-sm font-semibold text-zinc-100 font-mono ml-auto">
              {dispenserStats?.last_dispense_price != null ? formatAmount(dispenserStats.last_dispense_price) : '—'}
            </span>
            {dispenserStats?.price_change_24h != null && dispenserStats.price_change_24h !== 0 && (
              <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                dispenserStats.price_change_24h >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {dispenserStats.price_change_24h >= 0 ? '+' : ''}{dispenserStats.price_change_24h.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Sell-side depth chart (takes chart area spot) */}
          <DispenserDepthChart
            dispensers={sortedDispensers}
            isLoading={dispensersLoading}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onDispenserClick={handleDispenserClick}
          />

          {/* Desktop tabs */}
          <div className="hidden lg:block">
            <DispenserDataTabs
              asset={baseAsset}
              totalSupply={totalSupply}
              dispenses={dispenses}
              dispensesLoading={dispensesLoading}
              otherMarkets={otherMarkets}
            />
          </div>
        </div>

        {/* == Mobile: Dispense Form (order-3) == */}
        <div className="order-3 lg:hidden bg-zinc-950 p-4 border-b border-zinc-800">
          <DispenseForm
            asset={asset}
            sortedDispensers={sortedDispensers}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
          />
        </div>

        {/* == Mobile Tab Bar (order-4) == */}
        <div className="order-4 lg:hidden bg-zinc-950 flex border-b border-zinc-800">
          {(['dispenses', 'holders', 'markets', 'dispensers'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileDataTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                mobileDataTab === tab
                  ? 'text-zinc-100 border-b-2 border-green-500'
                  : 'text-zinc-500 border-b-2 border-transparent'
              }`}
            >
              {MOBILE_TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* == Mobile Tab Content (order-5) == */}
        <div className="order-5 lg:hidden bg-zinc-950 h-[300px] overflow-y-auto">
          {mobileDataTab === 'dispenses' && (
            <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />
          )}
          {mobileDataTab === 'holders' && <HoldersTable asset={baseAsset} totalSupply={totalSupply} />}
          {mobileDataTab === 'markets' && <MarketsTable markets={otherMarkets} />}
          {mobileDataTab === 'dispensers' && <DispensersEmpty />}
        </div>
      </div>

      {/* Dispenser detail modal */}
      {modalDispenser && (
        <DispenserModal
          dispenser={modalDispenser}
          asset={asset}
          onClose={() => setModalDispenser(null)}
        />
      )}
    </div>
  )
}
