'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DispenseSurface } from '@/components/dispense-surface'
import { DISPENSE_DEFAULT_ASSET, omitDefault, pairPath, replacePairPath, type ResolvedAsset } from '@/lib/trade-routes'

/**
 * XCP is what this route means with no segment, so naming it explicitly adds
 * a second URL for one page. Every path this form writes goes through here.
 */
const segment = (asset: string) => omitDefault(asset, DISPENSE_DEFAULT_ASSET)

/**
 * Dispensing is always ASSET against BTC, so there is only ever one segment.
 * The tab IS the route: switching sides navigates, which is what makes the
 * side shareable and the back button meaningful.
 */
export default function SellClient({ asset: routeAsset }: { asset: ResolvedAsset | null }) {
  const router = useRouter()
  // Protocol name drives the APIs; canonical name drives the URL.
  /**
   * URL, or XCP. Nothing is remembered: a dispense surface opened with no
   * asset named should always be the same surface, and XCP is what it is.
   */
  const [selection, setSelection] = useState({
    name: routeAsset?.name ?? DISPENSE_DEFAULT_ASSET,
    canonical: routeAsset?.canonical ?? DISPENSE_DEFAULT_ASSET,
  })
  const asset = selection.name

  return (
    <Suspense>
      <DispenseSurface
        asset={asset}
        assetLabel={selection.canonical}
        mode="sell"
        onModeChange={(m) => m === 'buy' && router.push(pairPath('/buy', segment(selection.canonical)), { scroll: false })}
        onAssetChange={(next, longname) => {
          setSelection({ name: next, canonical: longname ?? next })
          replacePairPath(pairPath('/sell', segment(longname ?? next)))
        }}
      />
    </Suspense>
  )
}
