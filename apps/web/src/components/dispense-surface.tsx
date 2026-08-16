'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { DispenseWidget } from '@/components/dispense-widget'
import { TradeChart } from '@/components/trade-chart'
import { TradeLayout } from '@/components/trade-layout'
import { useAssetDispensers } from '@/lib/hooks/useAssetDispensers'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { useFormSettings } from '@/lib/hooks/useFormSettings'
import { FormSettings, FeeRateSetting } from '@/components/form-settings'
import type { ChartTimeframe } from '@/lib/hooks/useTradeSeries'

/**
 * The dispense surface, shared by /buy, /sell and their per-asset routes.
 *
 * Both render the same thing; the route only decides where the asset comes
 * from. Keeping the per-asset URL real (rather than redirecting it to a
 * query string) means every existing link into a specific asset's
 * dispensers still lands somewhere shareable and indexable.
 *
 * This component fetches and orders the dispensers; which one a purchase
 * actually goes to is decided inside the form, since that depends on what
 * has been typed.
 */
export function DispenseSurface({
  asset,
  assetLabel,
  onAssetChange,
  mode,
  onModeChange,
}: {
  asset: string
  /**
   * What to call the asset on screen. The route already resolved a subasset's
   * longname, so passing it down beats re-deriving it from a market lookup
   * that a dispenser-only subasset won't have — that fallback shows the bare
   * numeric name.
   */
  assetLabel: string
  /** Omitted on the per-asset routes, where the asset is the URL. */
  onAssetChange?: (asset: string, longname: string | null) => void
  /** Which side is showing — /buy or /sell. The route IS the tab. */
  mode: 'buy' | 'sell'
  onModeChange: (mode: 'buy' | 'sell') => void
}) {
  const searchParams = useSearchParams()
  // ?address= deep-links a specific dispenser (the browse list links this
  // way), pinning the route to it instead of letting the form choose.
  const pinnedAddress = searchParams.get('address')

  const { dispensers, isLoading } = useAssetDispensers(asset)
  const suggestedFee = useFeeRate()
  const { feeRate, setFeeRate } = useFormSettings()
  const [chartOpen, setChartOpen] = useState(false)
  /**
   * The pop-out chart opens on All, deliberately not remembered.
   *
   * A form's chart is there to answer "is this price sane" for a market you
   * may never have looked at, and most Counterparty markets are thin enough
   * that a month of history is often a flat line or nothing at all. All time
   * is the only window guaranteed to contain the trades there are. It stays a
   * fixed default rather than a preference — unlike the browse timeframe,
   * which is a way of reading a table, this is the opening frame of a fresh
   * question each time.
   */
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('All')

  // Cheapest first: the dispenser a buyer wants is almost always the one
  // asking least, and every index below refers to this order.
  // The API already sorts by price; an emptied dispenser is still 'open'
  // but has nothing to give, so it is noise in a buy list.
  const withStock = dispensers.filter((d) => Number(d.give_remaining) > 0)

  /**
   * Prefer dispensers that vend ONE unit per payment.
   *
   * Those let a buyer pick any whole number; a lot of 100 silently means "7 is
   * not a thing you can buy", which is the confusing part. Measured over 1000
   * open dispensers: 95% vend a single unit and only 5 of 946 assets mix lot
   * sizes, so this is invisible almost everywhere.
   *
   * It FALLS BACK rather than filtering outright, because 38 of those 946
   * assets have nothing but larger lots — hiding them would tell someone an
   * asset has no dispensers when it has several. Where that happens the form
   * spells the lot size out.
   *
   * Cost, measured: on 2 assets a non-unit dispenser is cheaper per unit and
   * ranks below a unit one. A rounding-error trade-off for a much simpler
   * buying model everywhere else.
   */
  const unitLots = withStock.filter((d) => Number(d.give_quantity_normalized) === 1)
  const sorted = unitLots.length > 0 ? unitLots : withStock
  const lotOnly = unitLots.length === 0 && withStock.length > 0

  return (
    <TradeLayout
      split={!chartOpen}
      modes={['buy', 'sell']}
      mode={mode}
      onModeChange={(m) => onModeChange(m as 'buy' | 'sell')}
      chartOpen={chartOpen}
      onChartToggle={() => setChartOpen((v) => !v)}
      chart={
        // Dispenser sales, priced in BTC — a different series from the DEX
        // pair chart on /swap and /limit, and labelled as such.
        <TradeChart
          venue="dispensers"
          pairSlug={null}
          asset={asset}
          title={assetLabel}
          quoteLabel="BTC"
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />
      }
      settings={
        <FormSettings>
          <FeeRateSetting
            value={feeRate}
            onChange={setFeeRate}
            suggested={suggestedFee}
            // Dispensers really are first-come: two buyers racing the same
            // dispenser are settled by confirmation order, not by who sent first.
            hint="A dispenser goes to whoever confirms first."
          />
        </FormSettings>
      }
    >
      <DispenseWidget
        asset={asset}
        assetLabel={assetLabel}
        onAssetChange={onAssetChange}
        dispensers={sorted}
        dispensersLoading={isLoading}
        showLadder={!chartOpen}
        pinnedAddress={pinnedAddress}
        mode={mode}
        feeRate={feeRate}
        lotOnly={lotOnly}
      />
    </TradeLayout>
  )
}
