'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { AssetSelect } from '@/components/asset-select'
import { Panel, PanelSection, AmountField, AssetChip, SelectAssetChip, FlipButton, BalancePresets } from '@/components/ui/form-kit'
import { QuoteRing } from '@/components/ui/quote-ring'
import { FormNotice, TxBroadcast } from '@/components/ui/form-notice'
import { ConnectCTA } from '@/components/connect-cta'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useBalance } from '@/lib/hooks/useBalance'
import { usePoolByPair } from '@/lib/hooks/usePools'
import { useAssetInfo } from '@/lib/hooks/useAssetInfo'
import { useDebounced } from '@/lib/hooks/useDebounced'
import { useXcpPrice, useBtcPrice, useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { fetcher, counterpartyUrl } from '@/lib/api/client'
import { formatAmount } from '@/utils/format-amount'
import { toBase, fromBase, fromBaseNumber, scaleBase, sanitizeAmountInput, rawErrorMessage, num, big, isPositive, DIVISIBLE_DECIMALS, ROUND_DOWN } from '@/utils/numeric'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'

/**
 * Market swap against whichever venue is cheaper.
 *
 * The quote comes from Counterparty core's own `/pools/{give}/{get}/quote`,
 * which prices the AMM pool and the order book together and reports the
 * split — so this widget never routes anything itself, and the number on
 * screen is the number core will fill against.
 *
 * What gets composed is an ordinary DEX order with `get_quantity` set to the
 * quoted output minus slippage. That is what makes it a market order: core
 * fills against pool and book at once, and it either clears at the quoted
 * rate or better, or rests as an order rather than filling badly.
 */

/**
 * Core answers in two shapes, verified against the live node.
 *
 * When it can price the pair at all — pool OR resting orders on the matching
 * side — it returns the full set. When there is neither, it returns a stub
 * carrying only `message`. Both are 200s, so the shape is the signal.
 *
 * A pool is NOT required: of four pools on mainnet, book-only pairs quote
 * perfectly well and just come back with pool_exists false and book_output
 * populated. Restricting the picker to pooled assets would cut the surface
 * down to four pairs for no reason.
 */
interface Quote {
  estimated_output: number
  pool_output: number
  book_output: number
  book_orders_matched?: number
  /** Input not consumed by the quote, including deliberately refunded pool rounding dust. */
  give_remaining?: number
  /** Output over the amount ASKED for, so it understates a partial fill. Not used. */
  effective_price?: number
  /** Percentage, not a quantity. Zero for book fills, real for pool fills. */
  price_impact: number
  pool_exists?: boolean
  fee_bps?: number
  fee_amount?: number
  /** Present only on the stub shape: no pool and no orders either way. */
  message?: string
}

/** Ten-minute blocks — a minute-old quote is still fresh by chain time. */
const QUOTE_REFRESH_MS = 60_000
/** Re-quote before signing; abort if the rate slipped more than this. */
const STALE_QUOTE_TOLERANCE = 0.99
/** Long enough to finish typing a number, short enough to feel immediate. */
const QUOTE_DEBOUNCE_MS = 250
/** A composed order: a couple of inputs, an OP_RETURN and change. */
const ORDER_VBYTES = 250

/** Trim the padding zeros off a fixed-decimal string before it enters a field. */
function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

export function SwapWidget({
  giveAsset,
  getAsset,
  giveLabel,
  getLabel,
  onSelect,
  onFlip,
  slippage,
  slippageAuto,
  onAutoSlippage,
  feeRate,
  expiration,
}: {
  giveAsset: string
  getAsset: string
  giveLabel: string
  getLabel: string
  /** Which leg the picker is changing. */
  onSelect: (leg: 'give' | 'get', asset: string, longname: string | null) => void
  onFlip: () => void
  /** The tolerance actually in force — already resolved from Auto upstream. */
  slippage: number
  slippageAuto: boolean
  /** Reports back what Auto should be for the quote currently on screen. */
  onAutoSlippage: (v: number) => void
  /** 0 means the network median at compose time. */
  feeRate: number
  expiration: number
}) {
  const { address } = useWallet()
  const { status: txStatus, txid, error: txError, composeOrder, reset } = useCompose()
  const { xcpUsd } = useXcpPrice()
  const btcUsdPrice = useBtcPrice()
  const medianFeeRate = useFeeRate()
  const [amount, setAmount] = useState('')
  const [priceMoved, setPriceMoved] = useState(false)
  const [selectorLeg, setSelectorLeg] = useState<'give' | 'get' | null>(null)
  /** Which way round the rate line reads. Purely a display preference. */
  const [rateInverted, setRateInverted] = useState(false)
  /** When the quote on screen was fetched — drives the countdown ring. */
  const [lastQuoteAt, setLastQuoteAt] = useState<number | null>(null)

  // Each leg carries its OWN divisibility. Nothing is assumed about either
  // side — a pool can pair any two assets, and until a flag arrives the
  // conversion reports unknown and the form refuses to submit. A wrong guess
  // here is a 100-million-fold error, not a rounding one.
  const {
    info: giveInfo,
    error: giveInfoError,
    notFound: giveInfoNotFound,
  } = useAssetInfo(giveAsset || null)
  const {
    info: getInfo,
    error: getInfoError,
    notFound: getInfoNotFound,
  } = useAssetInfo(getAsset || null)
  const giveDivisible: boolean | undefined = giveInfo?.divisible
  const getDivisible: boolean | undefined = getInfo?.divisible
  const detailsUnavailableAsset =
    giveAsset && (!!giveInfoError || giveInfoNotFound)
      ? giveAsset
      : getAsset && (!!getInfoError || getInfoNotFound)
        ? getAsset
        : null

  const {
    balance,
    balanceNormalized,
    balanceError,
    balanceLoading,
    refreshBalance,
  } = useBalance(address, giveAsset)
  const balanceKnown = balance !== null && balanceNormalized !== null
  const amountNum = num(amount)
  // Each leg converts with its own flag — a div/indiv pair uses both scales.
  const giveResult = toBase(amount, giveDivisible)
  const giveRaw = giveResult.ok ? giveResult.raw : 0
  const amountError = !giveResult.ok && amount.trim() !== '' ? giveResult.error : null

  // Quote the number that was actually typed, not each keystroke on the way
  // to it: "1000" would otherwise fire four requests, three for amounts
  // nobody asked about, and late answers can land out of order.
  const debouncedRaw = useDebounced(giveRaw, QUOTE_DEBOUNCE_MS)
  const quoteUrl =
    giveAsset && getAsset && debouncedRaw > 0
      ? counterpartyUrl(`/pools/${giveAsset}/${getAsset}/quote?quantity=${debouncedRaw}`)
      : null
  const fetchQuote = (url: string): Promise<Quote> =>
    fetcher(url).then((d) => (d as { result: Quote }).result)
  const { data: quote, isValidating, mutate: mutateQuote } = useSWR<Quote>(quoteUrl, fetchQuote, {
    refreshInterval: QUOTE_REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setLastQuoteAt(Date.now()),
  })
  /**
   * The figures on screen don't describe what's typed — either a request is
   * in flight, or the amount has moved on and its quote hasn't been asked for
   * yet. Both cases must dim the output; showing a crisp number priced from a
   * different amount is the one thing this form must never do.
   */
  const staleQuote = isValidating || giveRaw !== debouncedRaw

  const outRaw = quote?.estimated_output ?? 0
  const out = fromBaseNumber(outRaw, getDivisible)

  /** One leg still to choose — the form is incomplete rather than wrong. */
  const incomplete = !giveAsset || !getAsset
  // Any asset can be picked, including ones with nothing to trade against —
  // the form explains the problem rather than hiding the option. Two empty
  // legs are not "the same asset", so this only applies once both are set.
  const samePair = !incomplete && giveAsset === getAsset
  const noMarket = !samePair && !!quote?.message
  // Core knows the pair but couldn't fill anything at this size.
  const noLiquidity =
    !detailsUnavailableAsset && !samePair && !quote?.message && !!quote && outRaw === 0 && giveRaw > 0
  // A book-only route can genuinely run dry mid-fill. When the pool contributes,
  // Core deliberately trims the input to the cheapest quantity that produces the
  // same integer output; its tiny give_remaining is refunded rounding dust, not a
  // liquidity shortfall (for example 0.00001164 token on a one-token live quote).
  const unfilledRaw = quote?.give_remaining ?? 0
  const partial = outRaw > 0 && unfilledRaw > 0 && (quote?.pool_output ?? 0) === 0
  const filledRaw = Math.max(0, giveRaw - unfilledRaw)
  const blocked = samePair || noMarket || noLiquidity

  const busy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const insufficient = balanceKnown && amountNum > balance
  const ready =
    !!giveAsset &&
    !!getAsset &&
    giveResult.ok &&
    giveRaw > 0 &&
    outRaw > 0 &&
    getDivisible !== undefined &&
    !busy &&
    balanceKnown &&
    !insufficient &&
    !blocked

  const poolShare = outRaw > 0 ? ((quote?.pool_output ?? 0) / outRaw) * 100 : 0
  // Only an XCP leg can be priced in dollars from what this form knows. A
  // pair with no XCP side simply shows no fiat rather than inventing a route
  // through one.
  const xcpLeg = giveAsset === 'XCP' ? amountNum : getAsset === 'XCP' ? out : null
  const legUsd = xcpUsd && xcpLeg != null ? xcpLeg * xcpUsd : null
  const usdLabel = legUsd != null ? `≈ $${legUsd.toFixed(2)}` : undefined

  /**
   * The rate, priced off what actually FILLS.
   *
   * Core's own `effective_price` divides by the amount ASKED for, so on a
   * partial fill it reports a rate nobody can get.
   */
  const filledGive = fromBaseNumber(filledRaw, giveDivisible) || amountNum
  const rate = out > 0 && filledGive > 0 ? out / filledGive : null
  const rateText =
    rate === null
      ? null
      : rateInverted
        ? `1 ${getLabel} = ${formatAmount(1 / rate)} ${giveLabel}`
        : `1 ${giveLabel} = ${formatAmount(rate)} ${getLabel}`
  // A unit price in dollars is only knowable through the XCP leg. With no XCP
  // on either side there is no route to a rate this form can vouch for, so it
  // shows none rather than inventing one.
  const giveUnitUsd =
    xcpUsd == null
      ? null
      : giveAsset === 'XCP'
        ? xcpUsd
        : getAsset === 'XCP' && filledGive > 0
          ? (out / filledGive) * xcpUsd
          : null
  const getUnitUsd =
    xcpUsd == null
      ? null
      : getAsset === 'XCP'
        ? xcpUsd
        : giveAsset === 'XCP' && out > 0
          ? (filledGive / out) * xcpUsd
          : null
  const rateBaseUsd = rateInverted ? getUnitUsd : giveUnitUsd

  // Named and graded rather than buried in the receipt: below 3% it is noise,
  // and past 5% it is the single most important number on the card.
  const impact = quote?.price_impact ?? 0

  /**
   * What Auto slippage should be for THIS trade.
   *
   * A fixed tolerance is wrong in both directions — 1% abandons a large trade
   * whose own impact exceeds it, and is needlessly loose on a small one. The
   * reasoning: another taker of roughly your size arriving first would move
   * the price by about what your own trade moves it, so tolerate that and no
   * more. Floored at 0.5% because below pool-fee territory it is noise, and
   * capped at 5% so Auto can never quietly authorise a bad fill — past that
   * the trade needs a deliberate manual choice.
   */
  const neededSlippage =
    quote && outRaw > 0 ? Math.min(5, Math.max(0.5, Math.ceil(impact * 10) / 10)) : 1
  useEffect(() => {
    onAutoSlippage(neededSlippage)
  }, [neededSlippage, onAutoSlippage])

  /** Estimate only — the true size is known after compose. The RATE is exact. */
  const effectiveFeeRate = feeRate || medianFeeRate
  const txFeeUsd =
    effectiveFeeRate != null && btcUsdPrice
      ? ((effectiveFeeRate * ORDER_VBYTES) / 1e8) * btcUsdPrice
      : null
  const impactTone =
    impact >= 5 ? 'text-red-400' : impact >= 3 ? 'text-amber-400' : 'text-zinc-500'

  /**
   * Depth of the asset being bought, from the pool reserve.
   *
   * The pool side only — resting orders move far too fast to sum honestly on
   * the client, so quoting a combined figure would be a number that is wrong
   * by the time it renders.
   */
  const { pool } = usePoolByPair(giveAsset || null, getAsset || null)
  const availableGet = !pool
    ? null
    : pool.asset_a === getAsset
      ? pool.reserve_a
      : pool.asset_b === getAsset
        ? pool.reserve_b
        : null

  // Flipping carries the quote into the pay field, so "sell what I was about
  // to buy" is one click rather than retyping the number.
  const flip = () => {
    // Carried across as an exact decimal string in the RECEIVING asset's
    // scale — it becomes the pay amount, and re-encoding a float here is
    // how an indivisible amount picks up a fraction it can never have.
    if (outRaw > 0) setAmount(fromBase(outRaw, getDivisible))
    onFlip()
    setPriceMoved(false)
  }

  const submit = async () => {
    if (!ready || !quote || !quoteUrl) return
    // Re-quote at the last moment: a quote up to a minute old is fine to show
    // but not to sign against, and a pool that moved under us should stop the
    // trade rather than silently fill worse.
    let fresh = quote
    try {
      fresh = await fetchQuote(quoteUrl)
      mutateQuote(fresh, { revalidate: false })
      if (fresh.estimated_output / quote.estimated_output < STALE_QUOTE_TOLERANCE) {
        setPriceMoved(true)
        return
      }
    } catch {
      // Fall back to the polled quote rather than blocking on a flaky refetch.
    }
    setPriceMoved(false)
    if (!giveResult.ok) return
    // Base units cross as exact digit strings: above 2^53 a JS number cannot
    // hold a quantity, and this is the value being signed.
    composeOrder({
      give_asset: giveAsset,
      give_quantity: giveResult.base,
      get_asset: getAsset,
      get_quantity: scaleBase(fresh.estimated_output, 1 - slippage / 100),
      expiration,
      fee_rate: feeRate || undefined,
    })
  }

  /**
   * Share-of-balance shortcuts.
   *
   * Gated on divisibility being KNOWN, not defaulted: 25% of 3 indivisible
   * units is 0.75, which has to floor to 0 rather than write a fraction of a
   * thing that has none. Rounding is DOWN for the same reason Max is exact —
   * a preset must never propose spending more than is held.
   */
  const setPercent = (pct: number) => {
    if (giveDivisible === undefined || balanceNormalized === null) return
    const share = big(balanceNormalized).times(pct).dividedBy(100)
    setAmount(trimZeros(share.toFixed(giveDivisible ? DIVISIBLE_DECIMALS : 0, ROUND_DOWN)))
    setPriceMoved(false)
  }
  const presetRow =
    address && giveDivisible !== undefined && isPositive(balanceNormalized) ? (
      <BalancePresets onPick={setPercent} />
    ) : undefined

  const giveChip = giveAsset ? (
    <AssetChip asset={giveAsset} label={giveLabel} onClick={() => setSelectorLeg('give')} />
  ) : (
    <SelectAssetChip onClick={() => setSelectorLeg('give')} />
  )
  const getChip = getAsset ? (
    <AssetChip asset={getAsset} label={getLabel} onClick={() => setSelectorLeg('get')} />
  ) : (
    <SelectAssetChip onClick={() => setSelectorLeg('get')} />
  )

  return (
    <>
      <Panel>
        <PanelSection>
          <AmountField
            label="Sell"
            value={amount}
            onChange={(v) => { setAmount(sanitizeAmountInput(v, giveDivisible)); setPriceMoved(false) }}
            chip={giveChip}
            meta={presetRow}
            sub={
              <div className="flex items-center justify-between gap-2">
                <span>{usdLabel}</span>
                {address && giveAsset && balanceKnown ? (
                  // Click-to-fill, exact: balanceNormalized is the string the
                  // API gave, so Max never round-trips through a float.
                  <button
                    onClick={() => setAmount(balanceNormalized)}
                    className={`min-w-0 truncate transition-colors hover:text-zinc-300 ${
                      insufficient ? 'text-red-400' : 'text-zinc-500'
                    }`}
                  >
                    Balance: {formatAmount(balance)}
                  </button>
                ) : address && giveAsset ? (
                  <span className="text-zinc-500">
                    Balance: {balanceLoading ? 'loading…' : 'unavailable'}
                  </span>
                ) : null}
              </div>
            }
          />
        </PanelSection>

        <FlipButton onClick={flip} />

        <PanelSection>
          <AmountField
            label="Buy"
            value={out > 0 ? formatAmount(out) : ''}
            readOnly
            dim={staleQuote && out > 0}
            chip={getChip}
            meta={
              availableGet != null ? (
                <span className="text-xs text-zinc-500">
                  Available: {formatAmount(availableGet)}
                </span>
              ) : undefined
            }
            sub={
              <div className="flex items-center justify-between gap-2">
                <span>{usdLabel}</span>
                <span className="text-zinc-500">
                  Slippage: {slippage}%
                  {slippageAuto && <span className="text-zinc-600"> · auto</span>}
                </span>
              </div>
            }
          />
        </PanelSection>

        {quote && outRaw > 0 && (
          <PanelSection className="text-xs">
            {/* The price line sits above the receipt, not inside it: the rate,
                what the trade costs you in impact, and how old the number is
                are the three things worth reading before pressing the button.
                The rest is detail. */}
            <div className="flex h-6 items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRateInverted((v) => !v)}
                aria-label="Invert rate"
                className="min-w-0 truncate text-left text-zinc-300 transition-colors hover:text-zinc-100"
              >
                {rateText}
                {rateBaseUsd !== null && (
                  <span className="text-zinc-500"> (${rateBaseUsd.toFixed(2)})</span>
                )}
              </button>
              <span className="flex shrink-0 items-center gap-2">
                {quote.pool_exists && (
                  <span className={impact >= 3 ? `font-medium ${impactTone}` : impactTone}>
                    Price impact {impact.toFixed(1)}%
                  </span>
                )}
                <QuoteRing
                  periodMs={QUOTE_REFRESH_MS}
                  lastUpdated={lastQuoteAt}
                  fetching={staleQuote}
                />
              </span>
            </div>

            {/* The itemised receipt is ruled off from the line above it. The
                rate, the impact and the quote's age are a summary you read
                before pressing; Route/fees/minimum are the small print. Run
                together in one stack, "Price impact" reads as just another
                line item rather than the headline number it is. */}
            <dl className="mt-2 space-y-1.5 border-t border-zinc-800 pt-2">
            <Row label="Route">
              {poolShare >= 99.5
                ? 'Pool'
                : poolShare <= 0.5
                  ? `Order book${quote.book_orders_matched ? ` · ${quote.book_orders_matched} order${quote.book_orders_matched === 1 ? '' : 's'}` : ''}`
                  : `${poolShare.toFixed(0)}% pool · ${(100 - poolShare).toFixed(0)}% book`}
            </Row>
            {/* Counterparty charges 0.5% on a pool with an XCP leg and 1% on
                any other pair, so the rate is worth stating rather than
                leaving as a silent difference between two markets. */}
            {quote.fee_bps != null && (
              <Row label="Pool fee">
                {(quote.fee_bps / 100).toFixed(quote.fee_bps % 100 === 0 ? 0 : 1)}%
              </Row>
            )}
            {effectiveFeeRate != null && (
              <Row label="Network fee">
                <span className={feeRate > 0 ? 'text-zinc-200' : undefined}>
                  {effectiveFeeRate} sat/vB
                  {txFeeUsd != null && (
                    <span className="text-zinc-500"> (~${txFeeUsd.toFixed(2)})</span>
                  )}
                </span>
              </Row>
            )}
            <Row label="Minimum received">
              {formatAmount(fromBaseNumber(scaleBase(outRaw, 1 - slippage / 100), getDivisible))} {getAsset}
            </Row>
            </dl>
          </PanelSection>
        )}

        <PanelSection className="space-y-2">
          {amountError && (
            <FormNotice tone="error">
              {amountError === 'unknown-divisibility' && detailsUnavailableAsset === giveAsset
                ? `Couldn't load ${giveAsset}'s details. Check the asset name or try again.`
                : rawErrorMessage(amountError, giveAsset)}
            </FormNotice>
          )}
          {detailsUnavailableAsset && detailsUnavailableAsset !== giveAsset && (
            <FormNotice tone="error">
              Couldn&apos;t load {detailsUnavailableAsset}&apos;s details. Check the asset name or try again.
            </FormNotice>
          )}
          {samePair && (
            <FormNotice tone="error">
              {giveLabel} is both sides of this trade. Pick a different asset to swap it against.
            </FormNotice>
          )}
          {noMarket && (
            <FormNotice tone="error">
              No pool or open orders for {giveAsset}/{getAsset}. You can still{' '}
              <a href={`/limit/${encodeURIComponent(getAsset)}`} className="underline">
                place a limit order
              </a>{' '}
              and wait for someone to take it.
            </FormNotice>
          )}
          {noLiquidity && (
            <FormNotice tone="error">
              Nothing on the book fills {formatAmount(amountNum)} {giveAsset} right now. Try a
              smaller amount, or{' '}
              <a href={`/limit/${encodeURIComponent(getAsset)}`} className="underline">
                set your own price
              </a>
              .
            </FormNotice>
          )}
          {partial && (
            <FormNotice tone="warn">
              Only {formatAmount(fromBaseNumber(filledRaw, giveDivisible))} of your{' '}
              {formatAmount(amountNum)} {giveAsset} fills at this rate — the book runs out. The
              remainder rests as an open order until someone takes it.
            </FormNotice>
          )}
          {priceMoved && (
            <FormNotice tone="warn">
              The rate moved while you were reading it. Check the new quote and submit again.
            </FormNotice>
          )}
          {balanceError && (
            <FormNotice tone="error">
              Couldn&apos;t load your spendable {giveLabel} balance.{' '}
              <button className="underline" onClick={() => void refreshBalance()}>
                Retry
              </button>
              .
            </FormNotice>
          )}
          {insufficient && amountNum > 0 && (
            <FormNotice tone="error">
              Not enough {giveLabel} — you have {formatAmount(balance)}.
            </FormNotice>
          )}
          {txError && <FormNotice tone="error">{txError}</FormNotice>}
          {txStatus === 'confirmed' && txid && <TxBroadcast txid={txid} onReset={reset} />}

          {/* The button says what is actually stopping the trade. A disabled
              control with a generic label makes the visitor hunt the card for
              the reason; naming it here means there is nothing to hunt for.
              Past 5% impact it turns red and asks for the press again — the
              trade is allowed, but not on the quiet default styling. */}
          <ConnectCTA
            onClick={submit}
            disabled={!ready}
            tone={incomplete ? 'muted' : impact >= 5 && ready ? 'sell' : 'primary'}
          >
            {busy
              ? COMPOSE_STATUS_LABELS[txStatus] ?? 'Working…'
              : incomplete
                ? 'Select a token'
                : blocked
                  ? 'Not tradeable here'
                  : address && !balanceKnown
                    ? balanceError
                      ? 'Balance unavailable'
                      : 'Checking balance…'
                  : amountNum === 0
                    ? 'Enter an amount'
                    : insufficient
                      ? `Insufficient ${giveLabel}`
                      : outRaw === 0 && staleQuote
                        ? 'Fetching quote…'
                        : impact >= 5
                          ? `Swap anyway — ${impact.toFixed(1)}% impact`
                          : `Swap ${giveLabel} for ${getLabel}`}
          </ConnectCTA>
        </PanelSection>
      </Panel>

      <AssetSelect
        open={selectorLeg !== null}
        onOpenChange={(o) => setSelectorLeg(o ? selectorLeg : null)}
        onSelect={(a, longname) => selectorLeg && onSelect(selectorLeg, a, longname)}
      />
    </>
  )
}

function Row({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={tone === 'warn' ? 'text-amber-400' : 'text-zinc-300'}>{children}</dd>
    </div>
  )
}
