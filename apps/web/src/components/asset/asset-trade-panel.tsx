'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, SegmentedList, SegmentedTrigger } from '@/components/ui/tabs'
import { SwapWidget } from '@/components/swap-widget'
import { LimitWidget } from '@/components/limit-widget'
import { FormSettings, SlippageSetting, FeeRateSetting, ExpirationSetting } from '@/components/form-settings'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { useFormSettings } from '@/lib/hooks/useFormSettings'

/**
 * `dispense` is a destination, not a mode — selecting it navigates.
 *
 * Buy and Sell here mean the ORDER SIDE, matching what those words mean on
 * /limit. They previously meant the dispenser direction, which put the same
 * two labels on two different meanings depending on which surface you were
 * looking at.
 */
type Mode = 'swap' | 'buy' | 'sell'
const TABS = ['swap', 'buy', 'sell', 'dispense'] as const

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
}: {
  asset: string
  assetLabel: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('swap')

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
            else setMode(m as Mode)
          }}
        >
          <SegmentedList className="w-full">
            {TABS.map((m) => (
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
        // XCP in, this asset out — the direction someone lands on an asset
        // page wanting. The flip control still reverses it.
        <SwapWidget
          giveAsset="XCP"
          getAsset={asset}
          giveLabel="XCP"
          getLabel={assetLabel}
          onSelect={(leg, a, longname) => leg === 'get' && goToAsset(a, longname)}
          onFlip={() => router.push(`/swap/${encodeURIComponent(assetLabel)}/XCP`)}
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
          quoteAsset="XCP"
          quoteLabel="XCP"
          onQuoteChange={() => {}}
          side={mode}
          expiration={expiration}
          compact
        />
      )}

    </div>
  )
}
