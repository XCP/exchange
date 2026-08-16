'use client'

import Link from 'next/link'
import { XcpUsdChart } from '@/components/home/xcp-usd-chart'
import { AssetTradePanel } from '@/components/asset/asset-trade-panel'
import { useXcpPrice } from '@/lib/hooks/useNetworkInfo'

/**
 * The homepage hero: XCP's price beside something to do about it.
 *
 * The homepage used to be four cards naming the nav, then a dashboard. Both
 * described the exchange rather than being one. This is the same arrangement
 * the asset page uses — chart on the left, trade rail on the right — because
 * that pairing already works there and the homepage was the only surface with
 * no way to act on it.
 *
 * XCP is the subject because it is the one asset every visitor already has a
 * reason to care about: it is the protocol's own token, it is the quote asset
 * for nearly every book on the network, and it is the number in the header.
 *
 * THE CHART IS NOT THE FORM'S MARKET. It is XCP in dollars, all-time — the
 * same series /price/XCP draws — and it deliberately does not follow whatever
 * the rail is quoting. It is context for being on the site at all, not a
 * readout of the trade being composed; coupling them would mean the price of
 * the protocol moving because someone picked a different asset to swap.
 *
 * The rail quotes BTC only because an asset cannot be its own market: the
 * limit form correctly refuses to render XCP/XCP, which is why
 * AssetTradePanel takes the quote as a prop instead of assuming XCP. The swap
 * tab inside it still follows its own rule — it appears only if XCP has a pool
 * and opens against whichever is deepest, rather than being forced to BTC,
 * because there is no XCP/BTC pool and pretending otherwise is exactly what
 * the gating was built to stop.
 */
export function HomeTradeHero() {
  const { xcpUsd } = useXcpPrice()

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold text-zinc-100">Peer-to-peer trading on Bitcoin</h1>
        {/* The one-line version of what this is. Kept because someone can
            arrive here never having heard of Counterparty, and the form
            beside it does not explain itself. */}
        <p className="text-xs text-zinc-500">
          Settles on-chain. No custodian, no counterparty risk — your keys sign every trade.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <XcpUsdChart height={300} />
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-600">
            <span>Counterparty&rsquo;s own token, and the quote asset for most books on the network.</span>
            {xcpUsd != null && <span className="text-zinc-500">≈ ${xcpUsd.toFixed(2)}</span>}
            <Link href="/XCP" className="text-zinc-500 hover:text-zinc-300">
              XCP details →
            </Link>
          </p>
        </div>

        <AssetTradePanel asset="XCP" assetLabel="XCP" quoteAsset="BTC" variant="hero" />
      </div>
    </div>
  )
}
