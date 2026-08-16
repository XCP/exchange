'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, SegmentedList, SegmentedTrigger } from '@/components/ui/tabs'
import { SwapWidget } from '@/components/swap-widget'
import { LimitWidget } from '@/components/limit-widget'
import { FormSettings, SlippageSetting, FeeRateSetting, ExpirationSetting } from '@/components/form-settings'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { useFormSettings } from '@/lib/hooks/useFormSettings'
import { useAssetPoolVenue } from '@/lib/hooks/useAssetPoolVenue'

/**
 * `dispense` is a destination, not a mode — selecting it navigates.
 *
 * Buy and Sell here mean the ORDER SIDE, matching what those words mean on
 * /limit. They previously meant the dispenser direction, which put the same
 * two labels on two different meanings depending on which surface you were
 * looking at.
 */
type Mode = 'swap' | 'buy' | 'sell'

/**
 * The trade form beside an asset's chart.
 *
 * The asset page is where someone forms an opinion, so it is where the action
 * belongs — the same reason Uniswap puts its swap widget on the token page
 * rather than making you carry the ticker to another URL.
 *
 * These are the SAME widgets the dedicated pages use, not lookalikes. What
 * differs is only what surrounds them: no URL syncing, because the asset is
 * fixed by the route, and picking a different asset navigates to that asset's
 * page instead of rewriting this one's identity out from under the header.
 */
export function AssetTradePanel({
  asset,
  assetLabel,
  quoteAsset = 'XCP',
  variant = 'full',
}: {
  asset: string
  assetLabel: string
  /**
   * What the limit form quotes this asset in. XCP for every asset page, which
   * is where nearly all Counterparty books are priced — but it has to be
   * injectable for the one case where the asset IS XCP, since an asset cannot
   * be its own market and the form correctly refuses to render one.
   */
  quoteAsset?: string
  /**
   * `hero` keeps only the swap FORM and turns limit and dispense into links.
   *
   * The homepage rail is an invitation, not a workbench: the point is that
   * something can be done here and where the other two live, not to carry
   * three forms in 22rem beside a chart. The asset page keeps all four inline
   * because that page is about one asset and the forms are the reason to be
   * on it.
   */
  variant?: 'full' | 'hero'
}) {
  const router = useRouter()

  /**
   * An asset with no pool gets no swap tab at all.
   *
   * Swapping is an AMM action, so without a pool the widget has nothing to
   * quote against and behaves oddly when the only liquidity is resting limit
   * orders. Hiding the tab rather than showing a broken one makes the absence
   * itself the signal: no swap tab means nobody has opened a pool yet.
   *
   * `counterAsset` comes from the server so this and /swap cannot disagree
   * about which venue an asset opens against.
   */
  const isHero = variant === 'hero'
  const { hasPool, preferred, isLoading: venueLoading } = useAssetPoolVenue(asset)
  const counterAsset = preferred?.counter_asset ?? 'XCP'

  const [modeOverride, setModeOverride] = useState<Mode | null>(null)
  /**
   * Derived rather than stored, so the default follows the pool answer when it
   * lands instead of being frozen at first render. An explicit choice wins,
   * except a choice of `swap` on an asset that turns out to have no pool.
   */
  const mode: Mode = isHero
    ? 'swap'
    : modeOverride && (modeOverride !== 'swap' || hasPool)
      ? modeOverride
      : hasPool
        ? 'swap'
        : 'buy'
  const setMode = setModeOverride

  /**
   * Held until the pool answer arrives, otherwise the swap tab appears and
   * then vanishes on assets that do not have a pool — which is most of them.
   */
  const tabs: readonly string[] = isHero
    ? ['swap', 'limit', 'dispense']
    : venueLoading
      ? ['buy', 'sell', 'dispense']
      : hasPool
        ? ['swap', 'buy', 'sell', 'dispense']
        : ['buy', 'sell', 'dispense']

  /**
   * The same preferences the dedicated form pages use — a fee rate set on
   * /swap is still in force in this rail. The ASSET is not shared: it comes
   * from the route and this panel never reads the recent-market memory,
   * because the page is about one asset by definition.
   */
  const {
    slippageAuto, setSlippageAuto,
    customSlippage, setCustomSlippage,
    setAutoSlippage, slippage,
    feeRate, setFeeRate,
    expiration, setExpiration,
  } = useFormSettings()
  const suggestedFee = useFeeRate()

  /** Choosing a different asset is a navigation, not a mutation of this page. */
  const goToAsset = (next: string, longname: string | null) =>
    router.push(`/${encodeURIComponent(longname ?? next)}`)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs
          value={mode}
          onValueChange={(m) => {
            // Dispensing is its own surface — it needs the ask ladder beside
            // the form, which this rail has no room for. Opened in a new tab
            // so the asset page you were reading stays where it was.
            if (m === 'dispense') {
              window.open(`/buy/${encodeURIComponent(assetLabel)}`, '_blank', 'noopener')
            }
            // In the hero, limit is a destination rather than a second form.
            // Navigated in this tab, not a new one: unlike dispense from an
            // asset page, there is nothing here worth preserving behind it.
            else if (m === 'limit') {
              router.push(`/limit/${encodeURIComponent(assetLabel)}/${encodeURIComponent(quoteAsset)}`)
            }
            else setMode(m as Mode)
          }}
        >
          <SegmentedList className="w-full">
            {tabs.map((m) => (
              <SegmentedTrigger key={m} value={m}>
                {m}
              </SegmentedTrigger>
            ))}
          </SegmentedList>
        </Tabs>
        <FormSettings>
          {mode === 'swap' && (
            <SlippageSetting
              value={customSlippage}
              onChange={setCustomSlippage}
              auto={slippageAuto}
              onAutoChange={setSlippageAuto}
              effective={slippage}
            />
          )}
          <FeeRateSetting value={feeRate} onChange={setFeeRate} suggested={suggestedFee} />
          <ExpirationSetting value={expiration} onChange={setExpiration} />
        </FormSettings>
      </div>

      {mode === 'swap' && (
        // Counter-asset in, this asset out — the direction someone lands on an
        // asset page wanting. The flip control still reverses it. The counter
        // side is whichever pool the server ranked first (XCP, else PEPECASH,
        // else the deepest), not a hardcoded XCP that may have no pool.
        <SwapWidget
          giveAsset={counterAsset}
          getAsset={asset}
          giveLabel={counterAsset}
          getLabel={assetLabel}
          onSelect={(leg, a, longname) => leg === 'get' && goToAsset(a, longname)}
          onFlip={() => router.push(`/swap/${encodeURIComponent(assetLabel)}/${encodeURIComponent(counterAsset)}`)}
          slippage={slippage}
          slippageAuto={slippageAuto}
          onAutoSlippage={setAutoSlippage}
          feeRate={feeRate}
          expiration={expiration}
        />
      )}

      {(mode === 'buy' || mode === 'sell') && (
        <LimitWidget
          asset={asset}
          assetLabel={assetLabel}
          onAssetChange={goToAsset}
          quoteAsset={quoteAsset}
          quoteLabel={quoteAsset}
          onQuoteChange={() => {}}
          side={mode}
          expiration={expiration}
          compact
        />
      )}

    </div>
  )
}
