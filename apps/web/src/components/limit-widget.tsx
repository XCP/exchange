'use client'

import { useState } from 'react'
import { AssetSelect } from '@/components/asset-select'
import { Panel, PanelSection, AmountField, AssetChip, SelectAssetChip, MiniChip, BalancePresets } from '@/components/ui/form-kit'
import { FormNotice, TxBroadcast } from '@/components/ui/form-notice'
import { ConnectCTA } from '@/components/connect-cta'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useBalance } from '@/lib/hooks/useBalance'
import { useAssetInfo } from '@/lib/hooks/useAssetInfo'
import { usePairStats } from '@/lib/hooks/usePairStats'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { OrderBookLadder } from '@/components/order-book-ladder'
import { useXcpPrice } from '@/lib/hooks/useNetworkInfo'
import { formatAmount } from '@/utils/format-amount'
import { toBase, totalToBase, sanitizeAmountInput, rawErrorMessage, big, num, isPositive, DIVISIBLE_DECIMALS, ROUND_DOWN } from '@/utils/numeric'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'

/**
 * A resting order at a price you pick.
 *
 * Price first, because it is the decision — the presets under it are
 * shortcuts to the prices that already exist (the book's best bid/ask), so
 * setting a limit "just inside the spread" doesn't mean reading the book on
 * another page and copying a number across.
 */

export function LimitWidget({
  asset,
  assetLabel,
  onAssetChange,
  quoteAsset,
  quoteLabel,
  onQuoteChange,
  side,
  expiration,
  compact = false,
  showLadder = false,
  seedPrice,
  seedAmount,
}: {
  asset: string
  /** Route-resolved name — a subasset's longname where it has one. */
  assetLabel: string
  onAssetChange: (asset: string, longname: string | null) => void
  quoteAsset: string
  quoteLabel: string
  onQuoteChange: (asset: string, longname: string | null) => void
  side: 'buy' | 'sell'
  expiration: number
  /**
   * Tighter layout for the rail beside an asset chart. Total stops being a
   * full-size field: it is derived from price × amount and never typed into,
   * so at this width it was a large input competing with the two that are
   * actually editable. As a receipt row it reads the way the swap form's
   * rate and minimum-received lines do.
   */
  compact?: boolean
  /**
   * The resting book beside the form. Off by default: the asset-page rail is
   * already a narrow column beside a chart and has no room for a second one.
   */
  showLadder?: boolean
  /**
   * Opening values, from a link that already named the trade — clicking a
   * resting order in Explore, or an old /trade/PAIR?price=…&amount=… link.
   *
   * Seeds, not controlled values: they initialise state once and the form
   * owns it afterwards, so typing over them is not fought by the URL.
   */
  seedPrice?: string
  seedAmount?: string
}) {
  const { address } = useWallet()
  const { status: txStatus, txid, error: txError, composeOrder, reset } = useCompose()
  const { xcpUsd } = useXcpPrice()
  /**
   * Sanitised on the way in — a seed arrives from a URL, which anyone can
   * write, and these feed straight into BigNumber conversions.
   *
   * Divisibility is not known yet at mount (it is fetched), so these are
   * cleaned as divisible. That is the permissive reading; the field's own
   * onChange re-cleans against the real answer as soon as it is edited, and
   * an out-of-range value is refused by toBase at submit either way.
   */
  const [price, setPrice] = useState(() => sanitizeAmountInput(seedPrice ?? '', undefined))
  const [amount, setAmount] = useState(() => sanitizeAmountInput(seedAmount ?? '', undefined))
  /** Which leg the asset picker is choosing for. */
  const [selectorLeg, setSelectorLeg] = useState<'base' | 'quote' | null>(null)

  // A missing pair is a normal state here: this order may create it. Read the
  // optional last price without the combined market hook's asset/holder calls,
  // and do not retry an expected 404 in the background.
  const { data: pairData } = usePairStats(asset ? `${asset}_${quoteAsset}` : '', {
    shouldRetryOnError: false,
  })
  // Divisibility belongs to each asset, not to a market. A limit order may be
  // the first event that creates a pair, so a 404 from /pair is expected and
  // must not prevent either leg from resolving.
  const {
    info: baseInfo,
    error: baseInfoError,
    notFound: baseInfoNotFound,
  } = useAssetInfo(asset || null)
  const {
    info: quoteInfo,
    error: quoteInfoError,
    notFound: quoteInfoNotFound,
  } = useAssetInfo(quoteAsset && quoteAsset !== 'XCP' ? quoteAsset : null)
  // useOrderBook takes the display market ("BASE/QUOTE") and reverses it
  // itself for core — the underscore slug is the site's own URL format.
  const { bids, asks, spread, spreadPct, isLoading: bookLoading } = useOrderBook(asset ? `${asset}/${quoteAsset}` : '')
  const baseDivisible: boolean | undefined = baseInfo?.divisible
  const quoteDivisible: boolean | undefined =
    quoteAsset === 'XCP' ? true : quoteInfo?.divisible

  /**
   * An asset can't be its own market. Reachable straight from the URL —
   * /limit/XCP takes XCP as the base and the default XCP quote — which
   * rendered "Price · XCP per XCP" and an order that could never match.
   */
  const samePair = !!asset && asset === quoteAsset

  // Book entries carry formatted decimal strings, not numbers.
  const bookPrice = (v: string | undefined) => (isPositive(v) ? num(v) : null)
  const bestBid = bookPrice(bids?.[0]?.price)
  const bestAsk = bookPrice(asks?.[0]?.price)
  const lastPrice = pairData?.last_price ?? null

  const priceNum = num(price)
  const amountNum = num(amount)
  const total = num(big(price).times(big(amount)))

  // Buying spends the quote asset, selling spends the base.
  const spendAsset = side === 'buy' ? quoteAsset : asset
  const { balance, balanceNormalized } = useBalance(address, spendAsset)
  const spendAmount = side === 'buy' ? total : amountNum

  const amountResult = toBase(amount, baseDivisible)
  const totalResult = totalToBase(price, amount, quoteDivisible)
  const inputError =
    !amountResult.ok && amount.trim() !== ''
      ? { error: amountResult.error, asset }
      : !totalResult.ok && price.trim() !== '' && amount.trim() !== ''
        ? { error: totalResult.error, asset: quoteAsset }
        : null
  const inputDetailsUnavailable =
    inputError?.error === 'unknown-divisibility' &&
    ((inputError.asset === asset && (!!baseInfoError || baseInfoNotFound)) ||
      (inputError.asset === quoteAsset && (!!quoteInfoError || quoteInfoNotFound)))

  const busy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const insufficient = spendAmount > balance
  const ready =
    !!asset &&
    !samePair &&
    priceNum > 0 &&
    amountResult.ok &&
    amountResult.raw > 0 &&
    totalResult.ok &&
    totalResult.raw > 0 &&
    !busy &&
    !insufficient

  const totalUsd = xcpUsd && quoteAsset === 'XCP' ? total * xcpUsd : null

  const submit = () => {
    if (!ready || !amountResult.ok || !totalResult.ok) return
    // Each leg carries its own scale: the base amount in the base asset's,
    // the total in the quote asset's. Mixing them is the div/indiv bug.
    if (side === 'buy') {
      composeOrder({
        give_asset: quoteAsset,
        give_quantity: totalResult.base,
        get_asset: asset,
        get_quantity: amountResult.base,
        expiration,
      })
    } else {
      composeOrder({
        give_asset: asset,
        give_quantity: amountResult.base,
        get_asset: quoteAsset,
        get_quantity: totalResult.base,
        expiration,
      })
    }
  }

  // "Market" takes the price that would fill now; the offsets step away from
  // it in the direction that rests rather than crosses.
  // Guarded on samePair too: a self-pair has no real book, but the API still
  // answers with a nominal price, and offering "Market" off that number would
  // populate the field with something meaningless.
  const marketPrice = samePair ? null : side === 'buy' ? bestAsk ?? lastPrice : bestBid ?? lastPrice

  /**
   * Share-of-balance quick fill for the Amount field.
   *
   * The percentage is always a share of what you SPEND, but the field it
   * fills is always the base amount — and on a buy those are different
   * assets. Selling 50% means half your PEPECASH; buying 50% means half your
   * XCP, which only becomes an amount once there is a price to divide by.
   * That is why the buy side is gated on price and the sell side is not.
   *
   * Rounds DOWN, and refuses to guess at divisibility: 25% of 3 indivisible
   * units is 0.75, which has to floor rather than write a fraction of a thing
   * that has none. Max on a sell takes the balance string as given, so it
   * agrees exactly with the Available button beside it.
   */
  const canPreset =
    !!address &&
    baseDivisible !== undefined &&
    isPositive(balanceNormalized) &&
    (side === 'sell' || priceNum > 0)
  const applyBalancePreset = (pct: number) => {
    if (!canPreset) return
    if (side === 'sell' && pct === 100) {
      setAmount(balanceNormalized)
      return
    }
    const spend = big(balanceNormalized).times(pct).dividedBy(100)
    const next = side === 'buy' ? spend.dividedBy(big(price)) : spend
    setAmount(next.toFixed(baseDivisible ? DIVISIBLE_DECIMALS : 0, ROUND_DOWN).replace(/\.?0+$/, ''))
  }
  const applyOffset = (pct: number) => {
    if (!marketPrice) return
    // Exact: the offset is applied to the book price without a float multiply.
    const adjusted = big(marketPrice).times(side === 'buy' ? 1 - pct / 100 : 1 + pct / 100)
    setPrice(adjusted.toFixed(DIVISIBLE_DECIMALS, 1).replace(/\.?0+$/, ''))
  }

  return (
    <div className="contents">
      <div className="min-w-0">
      <Panel>
        <PanelSection>
          <AmountField
            label={asset && !samePair ? `Price · ${quoteLabel} per ${assetLabel}` : 'Price'}
            value={price}
            onChange={(v) => setPrice(sanitizeAmountInput(v, true))}
            placeholder={marketPrice ? formatAmount(marketPrice) : '0'}
            // A chip, not plain text: this leg is as selectable as the other
            // two, and rendering it as a label made the quote look fixed.
            chip={
              <AssetChip
                asset={quoteAsset}
                label={quoteLabel}
                onClick={() => setSelectorLeg('quote')}
              />
            }
            meta={
              // Every one of these is an offset FROM the market price, so
              // with no asset picked — or a market with an empty book —
              // there is nothing to offset from and they'd be dead buttons.
              marketPrice ? (
                // Ordered furthest-from-market to at-market, so the most
                // aggressive option sits on the right under the thumb —
                // mirroring Max's position in the swap form's presets.
                //
                // Two chips, not four. −1% went first for being inside the
                // spread on most books here; ±5% followed for the same
                // reason in weaker form — these books are thin enough that
                // 5% and 10% rarely name different sides of anything, so it
                // was a third button asking for a distinction the market
                // could not make. What is left is "at market" and "clearly
                // away from it", which are the two real intentions.
                <div className="flex items-center gap-1">
                  <MiniChip onClick={() => applyOffset(10)}>
                    {side === 'buy' ? '−' : '+'}10%
                  </MiniChip>
                  <MiniChip onClick={() => applyOffset(0)}>Market</MiniChip>
                </div>
              ) : undefined
            }
            sub={
              <div className="flex items-center justify-between gap-2">
                <span className="flex gap-3">
                  {bestBid != null && <span>Bid: {formatAmount(bestBid)}</span>}
                  {bestAsk != null && <span>Ask: {formatAmount(bestAsk)}</span>}
                </span>
                {/* Buying spends the QUOTE, and the quote chip is on this
                    field — the swap form puts a balance under the field whose
                    asset it belongs to, not wherever there is room. */}
                {address && side === 'buy' && (
                  <span className="text-zinc-500">Available: {formatAmount(balance)}</span>
                )}
              </div>
            }
          />
        </PanelSection>

        <PanelSection>
          <AmountField
            label="Amount"
            value={amount}
            onChange={(v) => setAmount(sanitizeAmountInput(v, baseDivisible))}
            chip={
              asset ? (
                <AssetChip asset={asset} label={assetLabel} onClick={() => setSelectorLeg('base')} />
              ) : (
                <SelectAssetChip onClick={() => setSelectorLeg('base')} />
              )
            }
            meta={canPreset ? <BalancePresets onPick={applyBalancePreset} /> : undefined}
            sub={
              // Every field in the swap form carries a sub row — fiat on the
              // left, something contextual on the right — and that rhythm is
              // what makes the sections equal height. Without one, this field
              // rendered visibly shorter than the rest of the card.
              <div className="flex items-center justify-between gap-2">
                <span>{totalUsd != null ? `≈ $${totalUsd.toFixed(2)}` : ''}</span>
                {address && side === 'sell' && (
                  <button
                    onClick={() => setAmount(balanceNormalized)}
                    className="transition-colors hover:text-zinc-300"
                  >
                    Available: {formatAmount(balance)}
                  </button>
                )}
              </div>
            }
          />
        </PanelSection>

        {compact ? (
          <PanelSection className="text-xs">
            {/* The swap form's price line: one row, primary reading on the
                left and its secondary on the right, no labels stacked above
                values. Fixed height so it doesn't jump when the fiat value
                appears. */}
            <div className="flex h-6 items-center justify-between gap-2">
              <span className="text-zinc-500">
                Total <span className="text-zinc-300">{total > 0 ? formatAmount(total) : '0'} {quoteLabel}</span>
              </span>
              <span className="text-zinc-500">
                {totalUsd != null ? `≈ $${totalUsd.toFixed(2)}` : ''}
              </span>
            </div>
          </PanelSection>
        ) : (
          <PanelSection>
            <AmountField
              label="Total"
              value={total > 0 ? formatAmount(total) : ''}
              readOnly
              chip={<AssetChip asset={quoteAsset} label={quoteLabel} />}
              sub={totalUsd != null ? `≈ $${totalUsd.toFixed(2)}` : undefined}
              meta={
                address && side === 'buy' ? (
                  <span className="text-xs text-zinc-500">Available: {formatAmount(balance)}</span>
                ) : undefined
              }
            />
          </PanelSection>
        )}

        <PanelSection className="space-y-2">
          {samePair && (
            <FormNotice tone="error">
              {assetLabel} is on both sides of this order. Pick a different asset to price it in.
            </FormNotice>
          )}
          {inputError && (
            <FormNotice tone="error">
              {inputDetailsUnavailable
                ? `Couldn't load ${inputError.asset}'s details. Check the asset name or try again.`
                : rawErrorMessage(inputError.error, inputError.asset)}
            </FormNotice>
          )}
          {/* An indivisible quote asset has no fractions to round into, so a
              small price × amount lands on zero. Blocking without saying so
              looks like the button is broken. */}
          {totalResult.ok && totalResult.raw === 0 && priceNum > 0 && amountNum > 0 && (
            <FormNotice tone="error">
              This works out to less than one whole {quoteLabel}, which is indivisible. Raise the
              price or the amount.
            </FormNotice>
          )}
          {insufficient && spendAmount > 0 && (
            <FormNotice tone="error">
              Not enough {spendAsset} — you have {formatAmount(balance)}.
            </FormNotice>
          )}
          {txError && <FormNotice tone="error">{txError}</FormNotice>}
          {txStatus === 'confirmed' && txid && <TxBroadcast txid={txid} onReset={reset} />}

          <ConnectCTA
            onClick={submit}
            disabled={!ready}
            tone={!asset || samePair ? 'muted' : side === 'sell' ? 'sell' : 'primary'}
          >
            {busy
              ? COMPOSE_STATUS_LABELS[txStatus] ?? 'Working…'
              : !asset
                ? 'Select a token'
                : samePair
                  ? 'Pick a different pair'
                  : `${side === 'buy' ? 'Buy' : 'Sell'} ${assetLabel}`}
          </ConnectCTA>
        </PanelSection>
      </Panel>

      <AssetSelect
        open={selectorLeg !== null}
        onOpenChange={(o) => setSelectorLeg(o ? selectorLeg : null)}
        onSelect={(a, longname) =>
          selectorLeg === 'quote' ? onQuoteChange(a, longname) : onAssetChange(a, longname)
        }
      />
      </div>

      {/* Only where there is room for it: the asset-page rail is already a
          narrow column beside a chart, and /limit drops it when its own chart
          is open, exactly as /buy and /sell drop the dispenser ladder. */}
      {showLadder && !samePair && (
        <OrderBookLadder
          bids={bids ?? []}
          asks={asks ?? []}
          spread={spread ?? '0'}
          spreadPct={spreadPct ?? '0'}
          isLoading={bookLoading}
          quoteLabel={quoteLabel}
          onPickPrice={(p) => setPrice(p.replace(/\.?0+$/, ''))}
        />
      )}
    </div>
  )
}
