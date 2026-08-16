'use client'

import { useState } from 'react'
import { useBalance } from '@/lib/hooks/useBalance'
import { useCompose } from '@/lib/wallet/useCompose'
import {
  usePoolAssetInfo,
  usePoolDepositQuote,
  usePoolWithdrawQuote,
  type PoolAddressPosition,
  type PoolSummary,
} from '@/lib/hooks/usePools'
import { Panel, PanelSection, AmountField, AssetChip, SelectAssetChip, MiniChip, CTA } from '@/components/ui/form-kit'
import { Tabs, SegmentedList, SegmentedTrigger } from '@/components/ui/tabs'
import { FormNotice, TxBroadcast } from '@/components/ui/form-notice'
import { formatAmount } from '@/utils/format-amount'
import { poolFeeLabel } from '@/utils/pool-fee'
import { useXcpPrice } from '@/lib/hooks/useNetworkInfo'
import { toBase, fromBase, scaleBase, sanitizeAmountInput, big, num, ROUND_DOWN } from '@/utils/numeric'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'

/**
 * Add and remove liquidity for one pool.
 *
 * Shares the grammar of every other form on the site — one card, hairline
 * sections, a big numeral per leg with its asset on the right, and a receipt
 * of derived figures underneath. It previously used a denser table-like
 * layout of its own, which made the same action look like a different product
 * depending on which page you reached it from.
 *
 * The "swap" third tab is gone. It rendered "pool swap composition is not
 * available in this view yet" above a permanently disabled button, and the
 * swap it described now exists as a real mode beside this one on /swap.
 */

/** Shares of an LP position, matching the amount presets on the trade forms. */
const WITHDRAW_PRESETS = [25, 50, 75, 100] as const

/** The two things you can do to a pool you are in. */
export type PoolManageTab = 'deposit' | 'withdraw'

/**
 * Exact conversions for the pool forms. A pool freely mixes an indivisible
 * asset with a divisible one, so each leg carries its own flag; the LP token
 * itself is always divisible.
 */
function toRawAmount(value: string, divisible: boolean | undefined) {
  const result = toBase(value.replace(/,/g, ''), divisible)
  return result.ok ? result : null
}

function fromRawAmount(value: number | string | null | undefined, divisible: boolean | undefined) {
  if (value == null) return ''
  return fromBase(value, divisible)
}

/** Round DOWN — a minimum-received that rounds up is a promise the pool can break. */
function applySlippage(raw: number | string | null | undefined, slippagePercent: number) {
  if (raw == null) return '0'
  return scaleBase(raw, 1 - slippagePercent / 100)
}

export function PoolManagePanel({
  pool,
  position,
  walletStatus,
  address,
  connecting,
  onConnect,
  slippagePercent,
  tab: controlledTab,
  onTabChange,
  legA,
  legB,
  onSelectAsset,
}: {
  /**
   * Null while the pair is still being chosen, or when the chosen pair has no
   * pool. The form still renders in that state — with `onSelectAsset` its own
   * legs ARE the pair picker, so there is nothing to show before it except
   * the form itself.
   */
  pool: PoolSummary | null
  position: PoolAddressPosition | null
  walletStatus: 'not_detected' | 'disconnected' | 'connected'
  address: string | null
  connecting: boolean
  onConnect: () => void | Promise<void>
  /**
   * Lifted to the page so it can live behind the gear beside the mode tabs,
   * which is rendered above this component. It is a setting like the fee
   * rate, not an input like an amount.
   */
  slippagePercent: number
  /**
   * Optional, and only /liquidity passes it: there the tab IS the URL
   * (/liquidity/deposit vs /liquidity/withdrawal), so it has to be readable
   * and writable from outside. Everywhere else the choice is local to the
   * card and stays here — a page that does not care should not have to hold
   * state it never reads.
   */
  tab?: PoolManageTab
  onTabChange?: (tab: PoolManageTab) => void
  /**
   * The legs, when the caller owns them. Only /liquidity does: on /swap and
   * /pool the pair is already settled by the page, and a resolved pool
   * overrides these anyway so the quantities always match the order the
   * quote and compose endpoints use.
   */
  legA?: string
  legB?: string | null
  /** Makes the leg chips clickable. Without it they are labels, as before. */
  onSelectAsset?: (which: 'a' | 'b') => void
}) {
  const [ownTab, setOwnTab] = useState<PoolManageTab>('deposit')
  const askedTab = controlledTab ?? ownTab
  const setTab = onTabChange ?? setOwnTab
  const [depositA, setDepositA] = useState('')
  const [depositB, setDepositB] = useState('')
  /**
   * Withdrawals are a SHARE, not a typed LP quantity.
   *
   * Nobody holds an opinion denominated in LP tokens — they want out of a
   * quarter, or all of it. Every venue surveyed agrees: PancakeSwap's remove
   * form opens on a percentage with 25/50/75/Max, and only offers a typed LP
   * amount behind a "Detailed" toggle. Launchpad does the same. We were the
   * outlier, asking for the abstraction instead of the intent.
   */
  const [withdrawPct, setWithdrawPct] = useState(0)
  /**
   * The legs are shown in the order they were PICKED, not the pool's.
   *
   * Counterparty stores a pool's assets in a fixed order and every endpoint
   * answers in it, so the two orders disagree half the time — pick XCP then
   * PEPECASH and the pool is PEPECASH/XCP. Rendering the pool's order made a
   * form that rearranged itself under the user; rendering the picked order
   * without care would swap the legs of a signed transaction.
   *
   * Neither is necessary. The quote endpoints accept either order and answer
   * with the assets NAMED, so the mapping is by name and this file never has
   * to know what the canonical order is or how it is derived.
   */
  const assetA = legA ?? pool?.asset_a ?? ''
  const assetB = legB ?? pool?.asset_b ?? null

  /**
   * Withdraw is unreachable until a pool is.
   *
   * The pair is chosen ON the deposit side, one leg at a time, because that
   * is what a deposit is — two assets. A withdrawal is about a POOL, and
   * asking for it with a one-asset picker labelled "Select pair" was asking
   * the wrong question with the wrong control: picking XCP does not name a
   * pool, it names half of one.
   *
   * So the tab is disabled until the pair resolves, and landing on
   * /liquidity/withdrawal cold shows the deposit side rather than an empty
   * form. Deep links that carry a pair — every link /positions emits — open
   * on withdraw directly, because those already name a pool.
   */
  const tab: PoolManageTab = pool ? askedTab : 'deposit'
  const { info: assetAInfo } = usePoolAssetInfo(assetA || null)
  const { info: assetBInfo } = usePoolAssetInfo(assetB)
  const { balance: balanceA } = useBalance(address, assetA || null)
  const { balance: balanceB } = useBalance(address, assetB)
  const { status, txid, error, composePoolDeposit, composePoolWithdraw, reset } = useCompose()
  const { xcpUsd } = useXcpPrice()

  // Not defaulted: an unresolved asset blocks the action rather than being
  // assumed divisible, which would be a 1e8 error on an indivisible one.
  const assetADivisible: boolean | undefined = assetAInfo?.divisible
  const assetBDivisible: boolean | undefined = assetBInfo?.divisible
  const depositAResult = toRawAmount(depositA, assetADivisible)
  const depositARaw = depositAResult?.raw ?? 0
  const { quote: depositQuote, isLoading: depositQuoteLoading } = usePoolDepositQuote(
    assetA || null,
    assetB,
    depositARaw,
  )
  const lpBalanceRaw = position?.balance.balance_raw ?? 0
  /**
   * Exact: an LP balance is a base-unit integer that can exceed 2^53, and
   * flooring is what keeps "Max" from asking for one unit more than is held.
   */
  const withdrawBase = big(lpBalanceRaw)
    .times(withdrawPct)
    .dividedBy(100)
    .integerValue(ROUND_DOWN)
    .toFixed(0)
  const withdrawRaw = Number(withdrawBase)
  const { quote: withdrawQuote, isLoading: withdrawQuoteLoading } = usePoolWithdrawQuote(
    assetA || null,
    assetB,
    withdrawRaw,
  )
  const minLpQuantity = applySlippage(depositQuote?.quantity_minted_estimate, slippagePercent)

  /**
   * Both quote endpoints echo `asset_a`/`asset_b` in the pool's own order,
   * whichever order they were asked in. Matching on the name is what lets the
   * display order float free of it — and it fails safe: an unrecognised pair
   * yields undefined rather than the wrong leg's number.
   */
  const quoteFlipped = depositQuote != null && depositQuote.asset_a !== assetA
  const requiredForB = quoteFlipped
    ? depositQuote?.quantity_a_required
    : depositQuote?.quantity_b_required

  const withdrawFlipped = withdrawQuote?.asset_a != null && withdrawQuote.asset_a !== assetA
  const withdrawEstA = withdrawFlipped
    ? withdrawQuote?.quantity_b_estimate
    : withdrawQuote?.quantity_a_estimate
  const withdrawEstB = withdrawFlipped
    ? withdrawQuote?.quantity_a_estimate
    : withdrawQuote?.quantity_b_estimate
  const minQuantityA = applySlippage(withdrawEstA, slippagePercent)
  const minQuantityB = applySlippage(withdrawEstB, slippagePercent)
  const isBusy = status === 'composing' || status === 'signing' || status === 'broadcasting'

  const quotedB = requiredForB != null ? fromRawAmount(requiredForB, assetBDivisible) : ''
  const lpBalance = position?.balance.balance ?? 0
  const hasLpPosition = lpBalanceRaw > 0

  /**
   * The paired leg is DERIVED, not asked for.
   *
   * Consensus clamps every deposit to the pool's current ratio, so a typed
   * second amount is either the same number the quote already knows or one
   * the chain will reject. It used to be an empty field with a "Use pool
   * ratio" chip beside it — a button to fill in the only valid answer. Every
   * venue surveyed fills it as you type; Uniswap greys it to say it is
   * computed, which `dim` does here.
   *
   * The exception is the first deposit: with no reserves there is no ratio,
   * and that deposit is what SETS the price, so both legs are typed.
   */
  const isFirstDeposit = depositQuote?.first_deposit === true
  const depositBValue = isFirstDeposit ? depositB : quotedB
  const depositBResult = toRawAmount(depositBValue, assetBDivisible)
  const depositBRaw = depositBResult?.raw ?? 0

  /**
   * USD, but only through XCP.
   *
   * There is no price feed for an arbitrary Counterparty asset, so a
   * PEPECASH/BITCRYSTALS pool simply has no dollar value to show and says
   * nothing rather than inventing one. Where a leg IS XCP the whole deposit
   * can be priced: a ratio-matched deposit puts equal value in both legs by
   * construction, so one side's dollar figure is the other's too.
   *
   * The first deposit is the exception — it SETS the ratio, so the legs are
   * only equal if the depositor makes them equal, and just the XCP leg is
   * priced.
   */
  const xcpSide = assetA === 'XCP' ? 'a' : assetB === 'XCP' ? 'b' : null
  const xcpLegAmount = xcpSide === 'a' ? num(depositA) : xcpSide === 'b' ? num(depositBValue) : 0
  const legUsd = xcpUsd && xcpSide && xcpLegAmount > 0 ? xcpLegAmount * xcpUsd : null
  const usdText = (forSide: 'a' | 'b') => {
    if (legUsd == null) return ''
    if (isFirstDeposit && xcpSide !== forSide) return ''
    return `≈ $${legUsd.toFixed(2)}`
  }

  /**
   * Canonical order comes from the QUOTE, not from the pool.
   *
   * Both cases need it and only one of them has a pool: a first deposit into
   * a pair nobody has opened still gets `asset_a`/`asset_b` back from the
   * quote endpoint, in the order consensus will store them. Reading it here
   * is what lets this form create a pool as well as add to one — which it
   * has to, now that there is no separate create page. The first deposit IS
   * the creation.
   */
  const canonicalA = depositQuote?.asset_a ?? pool?.asset_a ?? null
  const depositValid =
    !!canonicalA && !!depositAResult && !!depositBResult && depositARaw > 0 && depositBRaw > 0
  const withdrawValid = !!pool && withdrawRaw > 0 && withdrawRaw <= lpBalanceRaw

  const submitDeposit = () => {
    if (!depositValid || !canonicalA || !assetB) return
    /**
     * Composed in CONSENSUS order regardless of what is on screen. This is
     * the one place the two orders must be reconciled, and it is reconciled
     * by name: whichever leg the protocol calls asset_a gets that leg's
     * amount.
     */
    const displayIsCanonical = canonicalA === assetA
    composePoolDeposit({
      asset_a: displayIsCanonical ? assetA : assetB,
      asset_b: displayIsCanonical ? assetB : assetA,
      // Exact digit strings — a base-unit quantity can exceed 2^53.
      quantity_a: displayIsCanonical ? depositAResult!.base : depositBResult!.base,
      quantity_b: displayIsCanonical ? depositBResult!.base : depositAResult!.base,
      min_lp_quantity: minLpQuantity,
    })
  }

  const submitWithdraw = () => {
    if (!withdrawValid || !pool) return
    // Same reconciliation as the deposit: the minimums are per-asset, and the
    // protocol names them by the pool's order rather than the screen's.
    const displayIsPoolOrder = pool.asset_a === assetA
    composePoolWithdraw({
      lp_asset: pool.lp_asset,
      quantity: withdrawBase,
      min_quantity_a: displayIsPoolOrder ? minQuantityA : minQuantityB,
      min_quantity_b: displayIsPoolOrder ? minQuantityB : minQuantityA,
    })
  }

  const cta = (label: string, disabled: boolean, onClick: () => void) => {
    /**
     * The button says what is missing before it says what it does. An unpicked
     * leg and a pair with no pool are different problems, and "Deposit
     * liquidity" greyed out names neither of them.
     */
    if (!assetB) {
      return (
        <CTA disabled tone="muted">
          Select a token
        </CTA>
      )
    }
    // A missing pool only blocks WITHDRAW. On the deposit side it is the
    // thing about to be created, so the button says so and stays live.
    if (!pool && tab === 'withdraw') {
      return (
        <CTA disabled tone="muted">
          No {assetA} / {assetB} pool
        </CTA>
      )
    }
    if (walletStatus !== 'connected') {
      return (
        <CTA onClick={onConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </CTA>
      )
    }
    return (
      <CTA
        onClick={status === 'confirmed' || status === 'error' ? reset : onClick}
        disabled={isBusy || disabled}
      >
        {status === 'confirmed'
          ? 'New action'
          : status === 'error'
            ? 'Try again'
            : isBusy
              ? (COMPOSE_STATUS_LABELS[status] ?? 'Working…')
              : label}
      </CTA>
    )
  }

  /** Fiat left, balance right — the sub-row rhythm every other form uses. */
  const balanceLine = (
    balance: number,
    onMax: (() => void) | null,
    usd = '',
    asset: string | null = '',
  ) => (
    <div className="flex items-center justify-between gap-2">
      <span>{usd}</span>
      {/* No asset, no balance. "Balance: 0" on an unpicked leg reads as a
          fact about your wallet rather than about the empty slot. */}
      {asset !== null &&
        address &&
        (onMax ? (
          <button onClick={onMax} className="transition-colors hover:text-zinc-300">
            Balance: {formatAmount(balance)}
          </button>
        ) : (
          <span>Balance: {formatAmount(balance)}</span>
        ))}
    </div>
  )

  return (
    <>
      <Panel>
        {/*
          Deposit and Withdraw are two directions of ONE form, not two forms,
          so the switch lives inside the card rather than floating above it —
          the same relationship Buy/Sell has on the limit form. Full width and
          split evenly because there are exactly two and neither is secondary.

          It sat outside the card sharing a row with loose slippage chips,
          which read as page furniture and made the card start mid-thought.
          Slippage went behind the gear where the other settings already are.
        */}
        <div className="p-2 pb-0">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as 'deposit' | 'withdraw')
              reset()
            }}
          >
            <SegmentedList className="w-full" tone="inPanel">
              <SegmentedTrigger value="deposit">deposit</SegmentedTrigger>
              <SegmentedTrigger
                value="withdraw"
                disabled={!pool}
                title={pool ? undefined : 'Pick both sides of a pair first'}
              >
                withdraw
              </SegmentedTrigger>
            </SegmentedList>
          </Tabs>
        </div>

        {tab === 'deposit' ? (
          <>
            <PanelSection>
              <AmountField
                label="Deposit"
                value={depositA}
                onChange={(v) => setDepositA(sanitizeAmountInput(v, assetADivisible))}
                chip={<AssetChip asset={assetA} onClick={onSelectAsset && (() => onSelectAsset('a'))} />}
                sub={balanceLine(balanceA, () => setDepositA(String(balanceA)), usdText('a'))}
              />
            </PanelSection>

            <PanelSection>
              <AmountField
                // The ratio qualifier is only true once a pool exists to
                // have one. Before that it describes a rule nothing is
                // enforcing yet.
                label={pool && !isFirstDeposit ? 'Paired deposit · at pool ratio' : 'Paired deposit'}
                value={depositBValue}
                onChange={
                  isFirstDeposit
                    ? (v) => setDepositB(sanitizeAmountInput(v, assetBDivisible))
                    : undefined
                }
                readOnly={!isFirstDeposit}
                // Greyed while a fresh quote is in flight: the old number is
                // still readable as a reference but is visibly not the answer.
                dim={!isFirstDeposit && depositQuoteLoading}
                chip={
                  assetB ? (
                    <AssetChip asset={assetB} onClick={onSelectAsset && (() => onSelectAsset('b'))} />
                  ) : (
                    // The unpicked leg, styled like the swap form's: an empty
                    // slot reads as an invitation, a disabled chip as a fault.
                    <SelectAssetChip onClick={() => onSelectAsset?.('b')} />
                  )
                }
                sub={
                  isFirstDeposit
                    ? balanceLine(balanceB, () => setDepositB(String(balanceB)), usdText('b'), assetB)
                    : // Not click-to-fill: the ratio owns this field.
                      balanceLine(balanceB, null, usdText('b'), assetB)
                }
              />
            </PanelSection>

            {(depositQuote || depositQuoteLoading) && (
              <PanelSection className="space-y-1 text-xs">
                {depositQuoteLoading ? (
                  <PoolRow label="Pool ratio">fetching…</PoolRow>
                ) : depositQuote?.first_deposit ? (
                  <PoolRow label="First deposit">sets the initial price</PoolRow>
                ) : (
                  <>
                    {/* "Pairs with" lived here when the second leg was an
                        empty field. It now fills itself, so the row was the
                        same number printed twice. */}
                    <PoolRow label="LP minted (est.)">
                      {formatAmount(fromRawAmount(depositQuote?.quantity_minted_estimate, true) || 0)}
                    </PoolRow>
                    <PoolRow label={`Min LP · slippage ${slippagePercent}%`}>
                      {formatAmount(fromRawAmount(minLpQuantity, true) || 0)}
                    </PoolRow>
                    {/* What the pool charges swappers, which is what an LP
                        earns. Shown instead of an APR: with this few pool
                        matches a yield figure would be noise dressed as a
                        rate, while the fee is a fact about the pool. */}
                    <PoolRow label="Pool fee">{poolFeeLabel(assetA, assetB ?? '')}</PoolRow>
                  </>
                )}
              </PanelSection>
            )}

            <PanelSection className="space-y-2">
              {status === 'error' && error && <FormNotice tone="error">{error}</FormNotice>}
              {status === 'confirmed' && txid && <TxBroadcast txid={txid} onReset={reset} />}
              {cta(pool ? 'Deposit liquidity' : 'Create pool & deposit', !depositValid, submitDeposit)}
            </PanelSection>
          </>
        ) : (
          <>
            <PanelSection>
              <AmountField
                label="Withdraw"
                value={`${withdrawPct}%`}
                readOnly
                // Reachable only with a pool, so the LP token always exists.
                chip={<AssetChip asset={pool?.lp_asset ?? ''} label="LP" />}
                meta={
                  hasLpPosition ? (
                    <div className="flex items-center gap-1">
                      {WITHDRAW_PRESETS.map((p) => (
                        <MiniChip
                          key={p}
                          active={withdrawPct === p}
                          onClick={() => setWithdrawPct(p)}
                        >
                          {p === 100 ? 'Max' : `${p}%`}
                        </MiniChip>
                      ))}
                    </div>
                  ) : undefined
                }
                sub={
                  <div className="flex items-center justify-between gap-2">
                    {/* The LP figure still shows — it is what gets signed —
                        but as a consequence of the share, not the question. */}
                    <span>
                      {withdrawRaw > 0
                        ? `${formatAmount(fromRawAmount(withdrawBase, true) || 0)} LP`
                        : ''}
                    </span>
                    <span>Your LP: {formatAmount(lpBalance)}</span>
                  </div>
                }
              />
            </PanelSection>

            {(withdrawQuote || withdrawQuoteLoading) && (
              <PanelSection className="space-y-1 text-xs">
                {withdrawQuoteLoading ? (
                  <PoolRow label="Underlying">fetching…</PoolRow>
                ) : withdrawQuote?.pool_exists && withdrawQuote.quantity_a_estimate != null ? (
                  <>
                    <PoolRow label="You receive (est.)">
                      {formatAmount(fromRawAmount(withdrawQuote.quantity_a_estimate, assetADivisible) || 0)}{' '}
                      {assetA} +{' '}
                      {formatAmount(fromRawAmount(withdrawQuote.quantity_b_estimate, assetBDivisible) || 0)}{' '}
                      {assetB}
                    </PoolRow>
                    <PoolRow label={`Min received · slippage ${slippagePercent}%`}>
                      {formatAmount(fromRawAmount(minQuantityA, assetADivisible) || 0)} {assetA} +{' '}
                      {formatAmount(fromRawAmount(minQuantityB, assetBDivisible) || 0)} {assetB}
                    </PoolRow>
                  </>
                ) : (
                  <PoolRow label="Underlying">{withdrawQuote?.message ?? 'enter an amount'}</PoolRow>
                )}
              </PanelSection>
            )}

            <PanelSection className="space-y-2">
              {!hasLpPosition && (
                <FormNotice tone="error">You hold no LP tokens for this pool.</FormNotice>
              )}
              {status === 'error' && error && <FormNotice tone="error">{error}</FormNotice>}
              {status === 'confirmed' && txid && <TxBroadcast txid={txid} onReset={reset} />}
              {cta('Withdraw liquidity', !withdrawValid, submitWithdraw)}
            </PanelSection>
          </>
        )}
      </Panel>
    </>
  )
}

/** A receipt line, matching the swap form's rows. */
function PoolRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-300">{children}</span>
    </div>
  )
}
