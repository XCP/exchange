'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SwapWidget } from '@/components/swap-widget'
import { PoolManagePanel } from '@/components/pool/pool-manage-panel'
import { usePoolByPair, usePoolAddressPosition } from '@/lib/hooks/usePools'
import { useWallet } from '@/lib/wallet/wallet-context'
import { TradeChart } from '@/components/trade-chart'
import { TradeLayout } from '@/components/trade-layout'
import { FormSettings, SlippageSetting, PoolSlippageSetting, FeeRateSetting, ExpirationSetting } from '@/components/form-settings'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { useFormSettings } from '@/lib/hooks/useFormSettings'
import { marketPairSlug, determineBaseQuote } from '@/utils/pairs'
import type { ChartTimeframe } from '@/lib/hooks/useTradeSeries'
import { pairPath, replacePairPath, type ResolvedAsset } from '@/lib/trade-routes'

/**
 * XCP is the one asset it is safe to assume. It is the protocol's own token,
 * the other side of almost every market, and the thing a visitor arriving
 * with no pair in mind is most likely holding — the role ETH plays on
 * Uniswap. There is no equivalent guess for the second leg: naming a
 * specific token there would be picking a favourite out of thousands, so it
 * stays empty and asks.
 */
const DEFAULT_GIVE = 'XCP'

/** A leg of the pair: the protocol name drives APIs, the canonical name the URL. */
interface Leg {
  name: string
  canonical: string
}

/** Nothing picked. Empty strings rather than null so the widget's props stay flat. */
const UNPICKED: Leg = { name: '', canonical: '' }

const asLeg = (a: ResolvedAsset | null, fallback: Leg): Leg =>
  a ? { name: a.name, canonical: a.canonical } : fallback

/**
 * The swap page.
 *
 * Segments are give/get and BOTH legs are free — Counterparty pools are not
 * XCP-only. A pool with an XCP leg charges 0.5% and any other pair 1%, which
 * the form reads off the quote rather than assuming.
 *
 * There is no Buy/Sell tab row here, unlike /limit. With two selectable legs
 * "buy" has no fixed referent, and the flip control between the fields
 * already expresses direction — a tab row would be a second, vaguer copy of
 * the same choice.
 *
 * The tabs are Swap/Limit instead, and Limit is a link out rather than a
 * mode: it navigates. This is one-way on purpose — someone on /swap who
 * can't get a fill wants to know a resting order is an option, while /limit
 * is a deliberate destination that doesn't need an exit next to its own name.
 */
export default function SwapClient({
  first,
  second,
}: {
  first: ResolvedAsset | null
  second: ResolvedAsset | null
}) {
  const [give, setGive] = useState<Leg>(() =>
    asLeg(first, { name: DEFAULT_GIVE, canonical: DEFAULT_GIVE }),
  )
  /**
   * Nothing is remembered here. With no second segment the form asks, every
   * time — a form that opens on whatever you last looked at is guessing, and
   * a wrong guess on a trading form is worse than an empty field. XCP is the
   * one assumption worth making, and it is already the give leg.
   */
  const [get, setGet] = useState<Leg>(() => asLeg(second, UNPICKED))
  /**
   * Slippage has three pieces because Auto is a mode, not a value: the manual
   * figure, whether Auto is on, and the figure Auto has worked out from the
   * live quote. Only one of them is ever in force. All of these except the
   * Auto figure persist — see lib/hooks/useFormSettings.
   */
  const {
    slippageAuto, setSlippageAuto,
    customSlippage, setCustomSlippage,
    setAutoSlippage, slippage,
    poolSlippage, setPoolSlippage,
    feeRate, setFeeRate,
    expiration, setExpiration,
  } = useFormSettings()
  const suggestedFee = useFeeRate()
  /**
   * Swap and Liquidity are two verbs on the SAME pool, so they are modes here
   * rather than pages. Limit keeps its own page: it is a different mechanism
   * (a resting order on the book), not another thing to do with a pool.
   */
  const [mode, setMode] = useState<'swap' | 'liquidity'>('swap')
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { pool } = usePoolByPair(
    mode === 'liquidity' ? give.name : null,
    mode === 'liquidity' ? get.name : null,
  )
  const { position } = usePoolAddressPosition(pool?.lp_asset ?? null, address)
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


  // Both legs live in the path, so direction is shareable. Replace rather
  // than push: picking through four assets shouldn't bury the page the user
  // arrived from under four back presses.
  const sync = (nextGive: Leg, nextGet: Leg) =>
    replacePairPath(pairPath('/swap', nextGive.canonical, nextGet.canonical))

  const select = (which: 'give' | 'get', asset: string, longname: string | null) => {
    const next: Leg = { name: asset, canonical: longname ?? asset }
    if (which === 'give') {
      setGive(next)
      sync(next, get)
    } else {
      setGet(next)
      sync(give, next)
    }
  }

  const flip = () => {
    setGive(get)
    setGet(give)
    sync(get, give)
  }


  // Label the chart in the same order the data is keyed, not in form order.
  const pairing = give.name && get.name ? determineBaseQuote(give.name, get.name) : null
  const chartTitle = pairing ? `${pairing.base} / ${pairing.quote}` : 'Select a token'
  const chartQuote = pairing?.quote ?? ''

  return (
    <TradeLayout
      modes={['swap', 'liquidity']}
      mode={mode}
      onModeChange={(m) => setMode(m as 'swap' | 'liquidity')}
      chartOpen={chartOpen}
      onChartToggle={() => setChartOpen((v) => !v)}
      chart={
        // The market is one thing whichever way the form points, so the chart
        // reads in the DEX's own base/quote order rather than flipping with
        // the give/get legs.
        <TradeChart
          venue="market"
          pairSlug={marketPairSlug(give.name, get.name)}
          asset={null}
          title={chartTitle}
          quoteLabel={chartQuote}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />
      }
      settings={
        // Liquidity keeps its own gear rather than losing it: the mode has
        // real settings, and a control that vanishes on one tab reads as a
        // missing feature. What is behind it differs because the settings do.
        mode === 'liquidity' ? (
        <FormSettings>
          <PoolSlippageSetting value={poolSlippage} onChange={setPoolSlippage} />
          <FeeRateSetting value={feeRate} onChange={setFeeRate} suggested={suggestedFee} />
        </FormSettings>
        ) : (
        <FormSettings>
          <SlippageSetting
            value={customSlippage}
            onChange={setCustomSlippage}
            auto={slippageAuto}
            onAutoChange={setSlippageAuto}
            effective={slippage}
          />
          <FeeRateSetting value={feeRate} onChange={setFeeRate} suggested={suggestedFee} />
          <ExpirationSetting value={expiration} onChange={setExpiration} />
        </FormSettings>
        )
      }
    >
      {mode === 'liquidity' ? (
        pool ? (
          <PoolManagePanel
            pool={pool}
            position={position}
            walletStatus={walletStatus}
            address={address}
            connecting={connecting}
            onConnect={connect}
            slippagePercent={poolSlippage}
          />
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-sm text-zinc-400">
              No pool for {give.canonical || '—'} / {get.canonical || '—'} yet.
            </p>
            <Link
              href="/liquidity/deposit"
              className="mt-3 inline-block rounded-sm bg-green-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-950 transition-colors hover:bg-green-400"
            >
              Add liquidity
            </Link>
          </div>
        )
      ) : (
      <SwapWidget
        giveAsset={give.name}
        getAsset={get.name}
        giveLabel={give.canonical}
        getLabel={get.canonical}
        onSelect={select}
        onFlip={flip}
        slippage={slippage}
        slippageAuto={slippageAuto}
        onAutoSlippage={setAutoSlippage}
        feeRate={feeRate}
        expiration={expiration}
      />
      )}
    </TradeLayout>
  )
}
