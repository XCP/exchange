'use client'

import { useState } from 'react'
import { Tabs, SegmentedList, SegmentedTrigger, TabsContent } from '@/components/ui/tabs'
import { TradesList } from '@/components/trades-list'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { DispensesTable } from '@/components/dispenses-table'
import { AssetOrdersTable } from '@/components/asset-orders-table'
import { AssetDispensersTable } from '@/components/asset-dispensers-table'
import { useAssetDispenses } from '@/lib/hooks/useAssetDispensers'
import type { Dispenser } from '@/types/trading'

export type ActivityTabKey = 'trades' | 'orders' | 'dispenses' | 'dispensers' | 'holders' | 'markets'

const LABELS: Record<ActivityTabKey, string> = {
  trades: 'Trades',
  orders: 'Orders',
  dispenses: 'Dispenses',
  dispensers: 'Dispensers',
  holders: 'Holders',
  markets: 'Markets',
}

/**
 * The table under every form surface.
 *
 * One component, but each page passes the tabs that matter to it — a swap
 * cares about fills and the book, a dispense page about dispenses and open
 * dispensers — so the first tab is always the one the reader came for
 * rather than a fixed set they have to click past.
 */
export function ActivityTabs({
  asset,
  quoteAsset = 'XCP',
  totalSupply = 0,
  tabs,
  dispensers,
  dispensersLoading,
  onSelectDispenser,
}: {
  asset: string
  quoteAsset?: string
  totalSupply?: number | string
  tabs: ActivityTabKey[]
  /** Only needed when 'dispensers' is among the tabs. */
  dispensers?: Dispenser[]
  dispensersLoading?: boolean
  onSelectDispenser?: (index: number) => void
}) {
  const [tab, setTab] = useState<ActivityTabKey>(tabs[0])
  // Dispenses are only fetched when a tab actually asks for them.
  const wantsDispenses = tabs.includes('dispenses')
  const { dispenses, isLoading: dispensesLoading } = useAssetDispenses(wantsDispenses ? asset : '')

  const active = tabs.includes(tab) ? tab : tabs[0]

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950">
      <Tabs value={active} onValueChange={(v) => setTab(v as ActivityTabKey)}>
        <SegmentedList variant="underline">
          {tabs.map((t) => (
            <SegmentedTrigger key={t} value={t} variant="underline">
              {LABELS[t]}
            </SegmentedTrigger>
          ))}
        </SegmentedList>

        <div className="h-[340px] overflow-y-auto">
          <TabsContent value="trades">
            <TradesList
              market={`${asset}/${quoteAsset}`}
              baseSymbol={asset}
              quoteSymbol={quoteAsset}
            />
          </TabsContent>
          <TabsContent value="orders">
            <AssetOrdersTable asset={asset} />
          </TabsContent>
          <TabsContent value="dispenses">
            <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} asset={asset} />
          </TabsContent>
          <TabsContent value="dispensers">
            <AssetDispensersTable
              dispensers={dispensers ?? []}
              isLoading={dispensersLoading ?? false}
              asset={asset}
              onSelect={onSelectDispenser}
            />
          </TabsContent>
          <TabsContent value="holders">
            <HoldersTable asset={asset} totalSupply={totalSupply} />
          </TabsContent>
          <TabsContent value="markets">
            <MarketsTable asset={asset} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
