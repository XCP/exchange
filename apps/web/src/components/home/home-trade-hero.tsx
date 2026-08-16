'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TradeChart } from '@/components/trade-chart'
import { type ChartTimeframe } from '@/lib/hooks/useTradeSeries'
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
 * Quoted in BTC, not XCP. XCP_BTC is the market that actually prices XCP (757
 * trades, against a single self-referential XCP_XCP row), and an asset cannot
 * be its own market — the limit form correctly refuses to render one, which is
 * why AssetTradePanel takes the quote as a prop rather than assuming XCP.
 *
 * The swap tab inside the rail follows its own rule: it appears only if XCP has
 * a pool, and opens against whichever pool is deepest. It is not forced to BTC,
 * because there is no XCP/BTC pool and pretending otherwise is the thing the
 * gating was built to stop.
 */
const XCP_PAIR = 'XCP_BTC'

export function HomeTradeHero() {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('All')
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
          <TradeChart
            venue="market"
            pairSlug={XCP_PAIR}
            asset={null}
            title="XCP / BTC"
            quoteLabel="BTC"
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            // Matches the asset page: beside a full form rather than above
            // one, so the default 180px leaves the rail lopsided.
            height={300}
          />
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-600">
            <span>Counterparty&rsquo;s own token, and the quote asset for most books on the network.</span>
            {xcpUsd != null && <span className="text-zinc-500">≈ ${xcpUsd.toFixed(2)}</span>}
            <Link href="/XCP" className="text-zinc-500 hover:text-zinc-300">
              XCP details →
            </Link>
          </p>
        </div>

        <AssetTradePanel asset="XCP" assetLabel="XCP" quoteAsset="BTC" />
      </div>
    </div>
  )
}
