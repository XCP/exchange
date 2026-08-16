'use client'

import { useState } from 'react'
import { LimitWidget } from '@/components/limit-widget'
import { TradeChart } from '@/components/trade-chart'
import { TradeLayout } from '@/components/trade-layout'
import { pairPath, replacePairPath, type ResolvedAsset } from '@/lib/trade-routes'
import { FormSettings, ExpirationSetting } from '@/components/form-settings'
import { useFormSettings } from '@/lib/hooks/useFormSettings'
import { marketPairSlug } from '@/utils/pairs'
import type { ChartTimeframe } from '@/lib/hooks/useTradeSeries'

/**
 * XCP is the safe half of the pair — the protocol's own token and the other
 * side of nearly every book, so it stands in the same place ETH does on
 * Uniswap. The base has no equivalent default: any specific token would be
 * an arbitrary favourite out of thousands, so the form asks for it instead.
 *
 * Note this is not what Uniswap does on ITS limit tab, where both legs come
 * preselected because its price row reads "when 1 ETH is worth N USDC" and
 * needs both to say anything. Ours reads "QUOTE per BASE" and degrades to a
 * plain "Price" with no book behind it, which is honest about there being
 * nothing to price yet.
 */
const DEFAULT_QUOTE = 'XCP'

/**
 * Segments are base/quote here, not give/get — a limit form has a pair and a
 * separate Buy/Sell tab, so direction is not part of the market's identity.
 * /limit/PEPECASH is the PEPECASH/XCP book; /limit/PEPECASH/BITCRYSTALS is
 * that book instead.
 */
export default function LimitClient({
  base,
  quote,
  seed,
}: {
  base: ResolvedAsset | null
  quote: ResolvedAsset | null
  /**
   * Opening values from the query string, for links that already named the
   * trade — a resting order clicked in Explore, or an old /trade/PAIR link.
   * Read once here; the form owns them from then on.
   */
  seed?: { side?: 'buy' | 'sell'; price?: string; amount?: string }
}) {
  // Protocol name drives the APIs; canonical name drives the URL.
  /**
   * Nothing is remembered. With no base in the URL the form asks for one
   * every time; the quote defaults to XCP and the base is the deliberate
   * choice, which is the only shape that is right on a first visit and a
   * hundredth.
   */
  const [selection, setSelection] = useState({
    name: base?.name ?? '',
    canonical: base?.canonical ?? '',
  })
  // The quote is a real choice, not a constant. Most books are priced in XCP
  // so that is the default, but PEPECASH/BITCRYSTALS and other quotes exist
  // and the form has no business pretending otherwise.
  const [quoteSelection, setQuoteSelection] = useState({
    name: quote?.name ?? DEFAULT_QUOTE,
    canonical: quote?.canonical ?? DEFAULT_QUOTE,
  })
  const [side, setSide] = useState<'buy' | 'sell'>(seed?.side ?? 'buy')
  const { expiration, setExpiration } = useFormSettings()
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
  const asset = selection.name

  // The quote only enters the path when it isn't the default, so the common
  // case stays a single tidy segment.
  const sync = (base: { canonical: string }, quoteLeg: { canonical: string }) =>
    replacePairPath(
      pairPath('/limit', base.canonical, quoteLeg.canonical === DEFAULT_QUOTE ? null : quoteLeg.canonical),
    )

  const selectAsset = (next: string, longname?: string | null) => {
    const picked = { name: next, canonical: longname ?? next }
    setSelection(picked)
    sync(picked, quoteSelection)
  }

  const selectQuote = (next: string, longname?: string | null) => {
    const picked = { name: next, canonical: longname ?? next }
    setQuoteSelection(picked)
    sync(selection, picked)
  }

  return (
    <TradeLayout
      modes={['buy', 'sell']}
      mode={side}
      onModeChange={(m) => setSide(m as 'buy' | 'sell')}
      chartOpen={chartOpen}
      onChartToggle={() => setChartOpen((v) => !v)}
      split={!chartOpen}
      chart={
        <TradeChart
          venue="market"
          pairSlug={marketPairSlug(asset, quoteSelection.name)}
          asset={null}
          title={asset ? `${selection.canonical} / ${quoteSelection.canonical}` : 'Select a token'}
          quoteLabel={quoteSelection.canonical}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />
      }
      settings={
        <FormSettings>
          <ExpirationSetting value={expiration} onChange={setExpiration} />
        </FormSettings>
      }
    >
      <LimitWidget
        asset={asset}
        assetLabel={selection.canonical}
        onAssetChange={selectAsset}
        quoteAsset={quoteSelection.name}
        quoteLabel={quoteSelection.canonical}
        onQuoteChange={selectQuote}
        side={side}
        expiration={expiration}
        showLadder={!chartOpen}
        seedPrice={seed?.price}
        seedAmount={seed?.amount}
      />
    </TradeLayout>
  )
}
