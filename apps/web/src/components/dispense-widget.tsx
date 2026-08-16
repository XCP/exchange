'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AssetSelect } from '@/components/asset-select'
import { Panel, PanelSection, AmountField, AssetChip, MiniChip } from '@/components/ui/form-kit'
import { FormNotice, TxBroadcast } from '@/components/ui/form-notice'
import { ConnectCTA } from '@/components/connect-cta'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useBalance } from '@/lib/hooks/useBalance'
import { useCompose } from '@/lib/wallet/useCompose'
import { useTradingPair } from '@/lib/hooks/useTradingPair'
import { useAddressDispensers } from '@/lib/hooks/useAssetDispensers'
import { useMempoolDispenses } from '@/lib/hooks/useMempool'
import { useBtcBalance } from '@/lib/hooks/useBtcBalance'
import { useBtcPrice } from '@/lib/hooks/useNetworkInfo'
import { useSatsMode } from '@/lib/sats-context'
import { formatAmount } from '@/utils/format-amount'
import { formatBtcAmount, formatPrice } from '@/utils/format-price'
import { toBase, sanitizeAmountInput, rawErrorMessage, big, num, fromSats, ROUND_DOWN } from '@/utils/numeric'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'
import type { Dispenser } from '@/types/trading'

/** Left unspent so the miner fee has somewhere to come from. */
const FEE_HEADROOM_SATS = 2000

/** Exact, as a string — this divides prices, so a float literal won't do. */
const SATS_PER_BTC = '100000000'

/**
 * How many tokens a dispenser can actually hand over, in whole lots.
 *
 * `give_remaining` alone overstates it whenever the remainder is smaller than
 * a lot: a dispenser holding 150 of a 100-token lot can only ever vend 100.
 */
function capacityTokens(d: Dispenser) {
  return big(d.give_remaining)
    .dividedBy(big(d.give_quantity))
    .integerValue(ROUND_DOWN)
    .times(big(d.give_quantity_normalized))
}

/**
 * Buying from a dispenser.
 *
 * You type how many tokens you want; the bitcoin cost and the dispenser it
 * comes from are both derived. Which dispenser is not a choice the buyer has
 * to make — a payment can only ever reach one, so the form takes the cheapest
 * that holds the whole amount. The list beside it shows that decision rather
 * than asking for it.
 */
export function DispenseWidget({
  asset,
  assetLabel,
  onAssetChange,
  dispensers,
  dispensersLoading,
  showLadder,
  pinnedAddress,
  mode,
  feeRate,
  lotOnly,
}: {
  asset: string
  /** The route's canonical name — a subasset's longname where it has one. */
  assetLabel: string
  onAssetChange?: (asset: string, longname: string | null) => void
  /** Price-sorted, cheapest first. */
  dispensers: Dispenser[]
  dispensersLoading: boolean
  /**
   * The ask ladder beside the form. Dropped while the price chart is open —
   * chart, form and ladder at once is three columns of reference material
   * competing for the same glance.
   */
  showLadder: boolean
  /** From ?address= — a link into one specific dispenser overrides routing. */
  pinnedAddress: string | null
  mode: 'buy' | 'sell'
  /** 0 means the network median at compose time. */
  feeRate: number
  /** True when this asset has no single-unit dispensers to offer. */
  lotOnly?: boolean
}) {
  const { address } = useWallet()
  const { status: txStatus, txid, error: txError, composeDispense, composeDispenser, reset } = useCompose()
  const { satsMode } = useSatsMode()
  const btcPrice = useBtcPrice()
  // Typed in TOKENS, because that is what a buyer is actually choosing. A
  // dispenser only sells whole lots, so this snaps DOWN to a lot boundary
  // and the sub-line says so when the two differ.
  const [tokensInput, setTokensInput] = useState('')
  const [selectorOpen, setSelectorOpen] = useState(false)

  const { data: pairData } = useTradingPair(asset ? `${asset}_BTC` : '')

  /**
   * Routing: cheapest dispenser that can fill the whole order.
   *
   * A dispense pays one address, so splitting across dispensers would mean
   * several transactions and several wallet prompts. Rather than build that,
   * the form picks a single dispenser and the amount snaps to what it holds.
   * With nothing typed the cheapest one is shown, which is also what someone
   * buying a single unit will get.
   */
  const requested = big(tokensInput)
  const typed = requested.isFinite() && requested.isGreaterThan(0)
  const pinnedIndex = pinnedAddress ? dispensers.findIndex((d) => d.source === pinnedAddress) : -1
  /** Dispensers somebody is already buying from, unconfirmed. */
  const contested = useMempoolDispenses()
  const routedIndex = (() => {
    if (dispensers.length === 0) return -1
    if (pinnedIndex >= 0) return pinnedIndex
    // Nothing typed, nothing routed. Highlighting the cheapest row before the
    // buyer has said what they want reads as a choice already made on their
    // behalf, and the quote underneath it is for an amount they never entered.
    if (!typed) return -1
    const fits = dispensers.findIndex(
      (d) => capacityTokens(d).isGreaterThanOrEqualTo(requested) && !contested.has(d.tx_hash),
    )
    if (fits >= 0) return fits
    // Everything deep enough is contested — take the cheapest that fits
    // anyway and warn, rather than silently routing to a dearer one.
    const anyFits = dispensers.findIndex((d) => capacityTokens(d).isGreaterThanOrEqualTo(requested))
    if (anyFits >= 0) return anyFits
    // More than any one dispenser holds: route to the deepest so the order
    // fills as far as a single payment can, and let the amount snap down.
    let best = 0
    for (let i = 1; i < dispensers.length; i++) {
      if (capacityTokens(dispensers[i]).isGreaterThan(capacityTokens(dispensers[best]))) best = i
    }
    return best
  })()
  const selected = routedIndex >= 0 ? dispensers[routedIndex] : undefined

  // core: remaining = floor(give_remaining / give_quantity). Exact, because
  // both are raw base units and either can exceed 2^53.
  const maxDispenses = selected
    ? num(big(selected.give_remaining).dividedBy(big(selected.give_quantity)).integerValue(ROUND_DOWN))
    : 0

  /**
   * The most lots this buyer could actually take: whichever runs out first,
   * their bitcoin or the dispenser's stock.
   *
   * Presets are a percentage of THIS rather than fixed multiples. Launchpad
   * could offer 1/5/10 because it only ever sold XCP; here a lot might be one
   * card or fifty thousand tokens, so a fixed count means nothing. A
   * percentage of what you can afford means the same thing on every asset.
   *
   * FEE_HEADROOM_SATS is held back because the miner fee comes out of the same
   * coins — a "max" that spent the entire balance would compose and then fail
   * for want of a fee.
   */
  const { sats: btcSats } = useBtcBalance(address)
  const affordableLots =
    selected && btcSats > 0
      ? num(
          big(Math.max(0, btcSats - FEE_HEADROOM_SATS))
            .dividedBy(big(selected.satoshirate))
            .integerValue(ROUND_DOWN),
        )
      : 0
  // Without a connected wallet the dispenser's stock is the only known limit.
  const maxLots = address ? Math.min(maxDispenses, affordableLots) : maxDispenses

  const perLot = selected ? big(selected.give_quantity_normalized) : big(0)
  // Whole lots only, and never more than the dispenser still holds.
  const n =
    selected && perLot.isGreaterThan(0) && requested.isFinite()
      ? Math.min(maxLots, num(requested.dividedBy(perLot).integerValue(ROUND_DOWN)))
      : 0
  const tokens = num(perLot.times(n))

  /**
   * WHY the amount was cut, not just that it was.
   *
   * `n` is clamped by three different things at once — whole lots, the
   * dispenser's stock, and what your bitcoin covers — and all three used to
   * surface as the same grey line reading "Rounds down to N". Asking for
   * 1,000,000 with enough BTC for 204 therefore reported a rounding, which is
   * what you call losing a fraction of a lot, not 99.98% of your order.
   *
   * Stock and balance are the ones worth interrupting for: they mean "you
   * cannot have what you asked for", where lot rounding only ever costs less
   * than a single lot and belongs in the quiet sub-line it already had.
   */
  const wantedLots =
    selected && perLot.isGreaterThan(0) && requested.isFinite() && requested.isGreaterThan(0)
      ? num(requested.dividedBy(perLot).integerValue(ROUND_DOWN))
      : 0
  const shortOfStock = wantedLots > maxDispenses
  // Only meaningful with a wallet connected; without one the balance is unknown.
  const shortOfBalance = !!address && wantedLots > affordableLots && affordableLots <= maxDispenses
  /** Whole-lot remainder only — the typed amount was affordable and in stock. */
  const rounded =
    requested.isFinite() &&
    requested.isGreaterThan(0) &&
    tokens < num(requested) &&
    !shortOfStock &&
    !shortOfBalance
  // `satoshirate` is the field core's payout formula reads
  // (messages/dispense.py: must_give = floor(btc_amount / satoshirate)).
  // satoshi_price is a convenience mirror and is NOT what consensus uses.
  const satsOwed = selected ? big(selected.satoshirate).times(n) : big(0)
  const btc = selected ? fromSats(satsOwed.toFixed(0)) : 0

  /**
   * An oracle dispenser prices in fiat and settles at the rate when the
   * payment confirms, so no fixed token amount can be promised here.
   */
  const oraclePriced = !!selected?.oracle_address

  /**
   * Which OTHER dispensers at this address the same payment also triggers.
   *
   * Not all of them. Core computes `must_give = floor(btc_amount /
   * satoshirate)` per dispenser (messages/dispense.py) and a result of zero
   * pays nothing — so a dispenser priced ABOVE what is being sent is simply
   * skipped. Sending 0.02 to an address running 0.01 / 0.02 / 0.03 triggers
   * the first two and leaves the third alone.
   *
   * The corollary is the part worth showing: that same floor means the 0.01
   * dispenser pays TWICE, because 0.02 buys two of its lots. The bonus is
   * not one of each, it is however many each price divides into.
   *
   * Capped by stock, since core skips a dispenser that cannot cover what the
   * payment asks of it rather than paying it partially.
   */
  const { dispensers: atAddress } = useAddressDispensers(selected?.source ?? null)
  const alsoPays = atAddress
    .filter((d) => d.tx_hash !== selected?.tx_hash)
    .map((d) => {
      const rate = big(d.satoshirate)
      if (!rate.isGreaterThan(0)) return null
      const lots = satsOwed.dividedBy(rate).integerValue(ROUND_DOWN)
      const stockLots = big(d.give_remaining).dividedBy(big(d.give_quantity)).integerValue(ROUND_DOWN)
      const paid = lots.isLessThan(stockLots) ? lots : stockLots
      if (!paid.isGreaterThan(0)) return null
      return { asset: d.asset, amount: paid.times(big(d.give_quantity_normalized)) }
    })
    .filter((x): x is { asset: string; amount: ReturnType<typeof big> } => x !== null)

  const btcUsd = btcPrice ? btc * btcPrice : null

  const busy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const ready = !!selected && n > 0 && !busy && !oraclePriced

  const submit = () => {
    if (!ready || !selected) return
    composeDispense({
      dispenser: selected.source,
      quantity: satsOwed.toFixed(0),
      fee_rate: feeRate || undefined,
    })
  }

  if (mode === 'sell') {
    return (
      <CreateDispenser
        asset={asset}
        assetLabel={assetLabel}
        divisible={pairData?.asset_info?.divisible}
        onAssetChange={onAssetChange}
        dispensers={dispensers}
        dispensersLoading={dispensersLoading}
        showLadder={showLadder}
        compose={composeDispenser}
        feeRate={feeRate}
        txStatus={txStatus}
        txid={txid}
        txError={txError}
        reset={reset}
      />
    )
  }

  return (
    <div className="contents">
      <div className="min-w-0">
        <Panel>
          <PanelSection>
            <AmountField
              label="You receive"
              value={tokensInput}
              onChange={(v) => setTokensInput(sanitizeAmountInput(v, pairData?.asset_info?.divisible))}
              chip={
                <AssetChip
                  asset={asset}
                  label={assetLabel}
                  onClick={onAssetChange ? () => setSelectorOpen(true) : undefined}
                />
              }
              meta={
                <div className="flex items-center gap-1">
                  {/* A share of what you can take, not a fixed count — see
                      affordableLots. Each still lands on a whole lot. */}
                  {maxLots > 0 &&
                    [25, 50].map((pct) => {
                      const lots = Math.max(
                        1,
                        num(big(maxLots).times(pct).dividedBy(100).integerValue(ROUND_DOWN)),
                      )
                      return (
                        <MiniChip
                          key={pct}
                          active={n === lots}
                          onClick={() => setTokensInput(perLot.times(lots).toFixed())}
                        >
                          {pct}%
                        </MiniChip>
                      )
                    })}
                  {maxLots > 0 && (
                    <MiniChip
                      active={n === maxLots}
                      onClick={() => setTokensInput(perLot.times(maxLots).toFixed())}
                    >
                      Max
                    </MiniChip>
                  )}
                </div>
              }
              sub={
                selected ? (
                  <>
                    {rounded
                      ? `Rounds down to ${n} × ${formatAmount(selected.give_quantity_normalized)} = ${formatAmount(tokens)} ${asset}`
                      : `${n} dispense${n === 1 ? '' : 's'} × ${formatAmount(selected.give_quantity_normalized)} each`}
                    {/* Most dispensers vend a single unit, so only an unusual lot
                        size needs calling out — that is when "why can't I buy 7?"
                        comes up. */}
                    {lotOnly && !perLot.isEqualTo(1) && (
                      <span className="ml-1 text-amber-400/80">
                        · only sold in lots of {formatAmount(selected.give_quantity_normalized)}
                      </span>
                    )}
                  </>
                ) : undefined
              }
            />
          </PanelSection>

          <PanelSection>
            <AmountField
              label="You send"
              value={btc > 0 ? formatBtcAmount(btc, satsMode, false) : ''}
              readOnly
              placeholder={satsMode ? '0' : '0.00000000'}
              chip={<AssetChip asset="BTC" />}
              sub={btcUsd != null && btc > 0 ? `≈ $${btcUsd.toFixed(2)}` : undefined}
              meta={
                /**
                 * What is available, in the units being bought. "170
                 * dispenses" made the reader do the multiplication to find out
                 * how much of the asset that was, and on a dispenser vending
                 * lots of 10 the two numbers differ by an order of magnitude.
                 */
                selected && maxDispenses > 0 ? (
                  <span className="text-xs text-zinc-500">
                    {formatAmount(perLot.times(maxDispenses).toFixed())} {assetLabel} available
                  </span>
                ) : undefined
              }
            />
          </PanelSection>

          <PanelSection className="space-y-2">
            {/* Keyed on the LIST, not on the routed pick. Nothing is routed
                until an amount is typed, and "no open dispensers" beside a
                full list of them is the worst kind of wrong. */}
            {dispensers.length === 0 && !dispensersLoading && (
              <FormNotice tone="error">No open dispensers for {assetLabel}.</FormNotice>
            )}
            {selected && contested.has(selected.tx_hash) && (
              <FormNotice tone="warn">
                Someone is already buying from this dispenser and their payment has not confirmed
                yet. A dispenser pays in transaction order, so if it empties first your BTC is
                spent and nothing is sent back. Wait a block, or pick another price.
              </FormNotice>
            )}
            {oraclePriced && (
              <FormNotice tone="error">
                This dispenser is priced by an oracle and settles at the rate when your payment
                confirms, so the amount you receive can&apos;t be fixed here. Pick another dispenser.
              </FormNotice>
            )}
            {/* Warnings rather than errors: the order still works, it just
                buys less than was typed. Balance is checked first — when both
                bite, the one you can act on is the money.
                
                Each states what the order WILL buy rather than claiming the
                field was rewritten, because it is not: the typed number stays
                put so it can be corrected, and the sub-line and "You send"
                already show the real figures. */}
            {shortOfBalance && (
              <FormNotice tone="warn">
                Your bitcoin covers {formatAmount(perLot.times(affordableLots).toNumber())}{' '}
                {assetLabel}, not {formatAmount(num(requested))} — this order buys{' '}
                {formatAmount(tokens)}.
              </FormNotice>
            )}
            {shortOfStock && !shortOfBalance && (
              <FormNotice tone="warn">
                The cheapest dispenser holds {formatAmount(perLot.times(maxDispenses).toNumber())}{' '}
                {assetLabel}, not {formatAmount(num(requested))} — this order buys{' '}
                {formatAmount(tokens)}.
              </FormNotice>
            )}
            {alsoPays.length > 0 && (
              <FormNotice tone="warn">
                This payment also triggers {alsoPays.length} other dispenser
                {alsoPays.length === 1 ? '' : 's'} at the same address, so you will additionally
                receive{' '}
                {alsoPays
                  .map((d) => `${formatAmount(d.amount.toFixed())} ${d.asset}`)
                  .join(', ')}
                . Dispensers priced above what you send are not triggered.
              </FormNotice>
            )}
            {txError && <FormNotice tone="error">{txError}</FormNotice>}
            {txStatus === 'confirmed' && txid && <TxBroadcast txid={txid} onReset={reset} />}

            <ConnectCTA onClick={submit} disabled={!ready}>
              {busy ? COMPOSE_STATUS_LABELS[txStatus] ?? 'Working…' : `Buy ${asset}`}
            </ConnectCTA>
            <p className="text-center text-[11px] text-zinc-500">
              Tokens arrive automatically once your bitcoin confirms. Purchases are final.
            </p>
          </PanelSection>
        </Panel>

        {onAssetChange && (
          <AssetSelect
            open={selectorOpen}
            onOpenChange={setSelectorOpen}
            onSelect={(next, longname) => {
              setTokensInput('')
              onAssetChange(next, longname)
            }}
            source="dispensers"
          />
        )}
      </div>

      {showLadder && (
      <DispenserList
        mode="buy"
        dispensers={dispensers}
        isLoading={dispensersLoading}
        activeIndex={routedIndex}
        takingTokens={tokens}
        contested={contested}
        pinned={pinnedIndex >= 0}
        /**
         * Exception to "the buy ladder is read-only".
         *
         * Prices are normally not clickable here because clicking one implies
         * a choice the router does not actually offer: the form routes by the
         * amount you want, not by the row you point at, so a click that looked
         * like it picked a dispenser would be a lie whenever a cheaper one
         * could not fill the order.
         *
         * With exactly one dispenser there is no routing decision left to get
         * wrong -- that row is where the purchase goes no matter what. The
         * only thing still missing is an amount, so clicking fills in one lot
         * and the quote appears. Nothing is highlighted before the buyer says
         * what they want, which made the single-dispenser case look inert.
         */
        onPickDispenser={
          dispensers.length === 1
            ? () => setTokensInput(big(dispensers[0].give_quantity_normalized).toFixed())
            : undefined
        }
      />
      )}
    </div>
  )
}

/**
 * Selling side: open a dispenser of your own.
 *
 * Counterparty lets a dispenser vend any lot size per payment. This form only
 * opens ONE-token dispensers, and that is a deliberate narrowing rather than
 * an omission.
 *
 * Measured against every open dispenser on mainnet (26,123): 94.5% already
 * vend exactly one token. The lot field was a required question with the same
 * answer nineteen times in twenty, sitting above the two fields that carry
 * the actual decision.
 *
 * The reason it can be dropped rather than merely defaulted is that a lot
 * size is not the only way to price something cheap, and it is the worse way.
 * The obvious objection is Bitcoin's dust limit — a token worth 90 satoshis
 * cannot be bought one at a time, since the payment output would be
 * unrelayable — so surely those sellers need a bigger lot? They do not. A
 * sub-dust RATE is legal and works: the buyer pays a multiple and core hands
 * back floor(paid / rate). Checked against the chain: 2,914 dispensers carry
 * a rate below dust (down to 1 satoshi) and 76.8% of them have dispensed —
 * a HIGHER hit rate than the above-dust ones.
 *
 * And it is better for the buyer. At 100 sat/token they must spend 546 sats
 * but may take 6, 7, 8 — any number. At a lot of 100 they must take exactly
 * 100, 200, 300. Pinning the lot to one gives finer granularity, not coarser.
 *
 * What is genuinely lost is bundling — the 4.2% who chose a lot above one
 * with a price that did not require it, selling a deliberate 10-pack. That is
 * a merchandising choice this form no longer expresses, and those sellers
 * need a venue that does.
 */
/** Every dispenser this form opens vends exactly this much per payment. */
const LOT = '1'
/**
 * Standard dust for a P2PKH output. Below this a payment cannot relay, so it
 * is the floor on a SINGLE purchase — not on the price. See above.
 */
const DUST_SATS = 546
function CreateDispenser({
  asset,
  assetLabel,
  divisible,
  feeRate,
  onAssetChange,
  dispensers,
  dispensersLoading,
  showLadder,
  compose,
  txStatus,
  txid,
  txError,
  reset,
}: {
  asset: string
  assetLabel: string
  divisible: boolean | undefined
  onAssetChange?: (asset: string, longname: string | null) => void
  dispensers: Dispenser[]
  dispensersLoading: boolean
  showLadder: boolean
  compose: ReturnType<typeof useCompose>['composeDispenser']
  feeRate: number
  txStatus: string
  txid: string | null
  txError: string | null
  reset: () => void
}) {
  const { address } = useWallet()
  const btcPrice = useBtcPrice()
  const [price, setPrice] = useState('')
  const [escrow, setEscrow] = useState('')
  const [selectorOpen, setSelectorOpen] = useState(false)
  const { balance, balanceNormalized } = useBalance(address, asset)

  const priceNum = num(price)
  const escrowNum = num(escrow)
  const usdPerToken = btcPrice ? priceNum * btcPrice : null

  // The asset's legs use its own scale; the BTC leg is always satoshis,
  // whatever the asset is. That mix is the whole div/indiv trap here.
  const lotResult = toBase(LOT, divisible)
  const escrowResult = toBase(escrow, divisible)
  // One token per dispense, so the rate IS the price — no multiplication, and
  // nothing for a rounding step to land between.
  const rateResult = toBase(price, true)
  const inputError = !escrowResult.ok && escrow.trim() !== '' ? escrowResult.error : null

  const rateSats = rateResult.ok ? Number(rateResult.base) : 0
  /**
   * The smallest purchase a buyer can actually make. Under the dust limit a
   * single token is not a relayable payment, so they must take enough at once
   * to clear it — which is a fact about the listing worth stating up front
   * rather than leaving a buyer to discover.
   */
  const minPurchase = rateSats > 0 && rateSats < DUST_SATS ? Math.ceil(DUST_SATS / rateSats) : 1

  /**
   * A dispenser vends whole tokens, so a fractional escrow strands its
   * remainder — locked up but never dispensable. Recoverable by closing the
   * dispenser, so this warns rather than blocks.
   */
  const strandedRemainder =
    divisible === true && escrowNum > 0 ? num(big(escrow).modulo(big(LOT))) : 0
  const dispenses = escrowNum > 0 ? num(big(escrow).dividedBy(big(LOT)).integerValue(ROUND_DOWN)) : 0
  /**
   * Escrowing less than one whole token is not a remainder problem, it is a
   * dispenser that can never dispense — every token in it is stranded from
   * the moment it opens. Only reachable on a divisible asset, and it blocks
   * rather than warns because there is no outcome worth paying a fee for.
   */
  const escrowBelowOneLot = escrowNum > 0 && dispenses === 0

  /**
   * Undercut the cheapest open dispenser by the smallest amount there is.
   *
   * Dispensers aren't a queue — a buyer pays whichever address they like — so
   * being cheapest doesn't win a position, it just makes yours the one most
   * buyers take. That makes the useful move "one satoshi under the floor"
   * rather than any particular discount, and one satoshi is the least you can
   * give up to get it.
   *
   * Computed in satoshis rather than by subtracting 0.00000001 from a decimal,
   * because a non-unit-lot dispenser can price a token at a FRACTION of a
   * satoshi (a 546-sat lot of 100 is 5.46 sat/token). Flooring that already
   * lands strictly below it; only an exact integer needs the extra step down.
   */
  const cheapestSats = (() => {
    const ask = dispensers[0]?.price_normalized
    if (!ask) return null
    const sats = big(ask).times(SATS_PER_BTC)
    return sats.isFinite() && sats.isGreaterThan(0) ? sats : null
  })()
  const floorSats = (() => {
    if (!cheapestSats) return null
    const down = cheapestSats.integerValue(ROUND_DOWN)
    const under = down.isLessThan(cheapestSats) ? down : down.minus(1)
    // At one satoshi there is nothing left to undercut with.
    return under.isGreaterThanOrEqualTo(1) ? under : null
  })()
  /** Above the floor by a margin, for listing without racing to the bottom. */
  const aboveFloorSats = cheapestSats
    ? cheapestSats.times(110).dividedBy(100).integerValue(ROUND_DOWN)
    : null
  const setSats = (sats: ReturnType<typeof big> | null) => {
    if (!sats) return
    setPrice(sats.dividedBy(SATS_PER_BTC).toFixed(8).replace(/0+$/, '').replace(/\.$/, ''))
  }

  const busy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const overBalance = escrowNum > balance
  const ready =
    lotResult.ok &&
    escrowResult.ok &&
    escrowResult.raw > 0 &&
    rateResult.ok &&
    rateSats > 0 &&
    priceNum > 0 &&
    !overBalance &&
    !escrowBelowOneLot &&
    !busy

  const submit = () => {
    if (!ready || !lotResult.ok || !escrowResult.ok || !rateResult.ok) return
    compose({
      asset,
      give_quantity: lotResult.base,
      escrow_quantity: escrowResult.base,
      mainchainrate: rateResult.base,
      fee_rate: feeRate || undefined,
    })
  }

  return (
    <div className="contents">
      <div className="min-w-0">
        <Panel>
          {/* Price leads, because with the lot pinned it is now the only
              thing being decided. The asset picker rides on this field's
              chip — it was on the lot field, which no longer exists. */}
          <PanelSection>
            <AmountField
              label={`Price per ${assetLabel}`}
              value={price}
              onChange={(v) => setPrice(sanitizeAmountInput(v, true))}
              chip={<AssetChip asset="BTC" />}
              // Tapping a ladder row already MATCHES a price, so these are the
              // two moves the ladder can't express: sit above the best ask, or
              // go under it. Floor is on the right, furthest-to-nearest like
              // the limit form's ±10%/Market — the most aggressive option
              // under the thumb.
              //
              // The whole row is absent with no open dispensers: both offsets
              // are derived FROM the cheapest ask, so with nothing to price
              // against they would be dead buttons.
              meta={
                cheapestSats ? (
                  <div className="flex items-center gap-1">
                    <MiniChip onClick={() => setSats(aboveFloorSats)}>+10%</MiniChip>
                    {floorSats && <MiniChip onClick={() => setSats(floorSats)}>Floor</MiniChip>}
                  </div>
                ) : undefined
              }
              // The USD gloss only — matching the swap and limit forms, whose
              // sub rows are `≈ $N` under the field they price. Restating the
              // BTC figure was left over from when a dispense could be
              // several tokens and the two numbers genuinely differed.
              sub={
                priceNum > 0
                  ? usdPerToken != null
                    ? `≈ $${usdPerToken.toFixed(2)}`
                    : undefined
                  : 'Each payment releases one token.'
              }
            />
          </PanelSection>

          <PanelSection>
            <AmountField
              label="Amount to escrow"
              value={escrow}
              onChange={(v) => setEscrow(sanitizeAmountInput(v, divisible))}
              chip={
                <AssetChip
                  asset={asset}
                  label={assetLabel}
                  onClick={onAssetChange ? () => setSelectorOpen(true) : undefined}
                />
              }
              meta={
                address ? (
                  <button
                    onClick={() => setEscrow(balanceNormalized)}
                    className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Available: {formatAmount(balance)}
                  </button>
                ) : undefined
              }
              sub={dispenses > 0 ? `${dispenses} dispense${dispenses === 1 ? '' : 's'}` : undefined}
            />
          </PanelSection>

          <PanelSection className="space-y-2">
            {inputError && (
              <FormNotice tone="error">
                {rawErrorMessage(inputError, asset)}
              </FormNotice>
            )}
            {overBalance && (
              <FormNotice tone="error">
                Not enough {assetLabel} — you have {formatAmount(balance)}.
              </FormNotice>
            )}
            {/* Both of these are consequences of the price, not mistakes in
                it — the dispenser works either way — so they warn. */}
            {minPurchase > 1 && !overBalance && (
              <FormNotice tone="warn">
                Below Bitcoin&apos;s dust limit, so buyers can&apos;t take one at a time — the
                smallest purchase will be {minPurchase} {assetLabel}. Raise the price, or sell on
                the <Link href={`/limit/${encodeURIComponent(assetLabel)}`} className="underline">order book</Link> instead.
              </FormNotice>
            )}
            {escrowBelowOneLot && !overBalance && (
              <FormNotice tone="error">
                Escrow at least 1 {assetLabel} — a dispenser vends one whole token per payment, so
                this one would have nothing to give.
              </FormNotice>
            )}
            {strandedRemainder > 0 && !escrowBelowOneLot && !overBalance && (
              <FormNotice tone="warn">
                Dispensers vend whole tokens, so {formatAmount(strandedRemainder)} {assetLabel} will
                sit in escrow undispensable. Closing the dispenser returns it.
              </FormNotice>
            )}
            {txError && <FormNotice tone="error">{txError}</FormNotice>}
            {txStatus === 'confirmed' && txid && <TxBroadcast txid={txid} onReset={reset} />}

            <ConnectCTA onClick={submit} disabled={!ready} tone="sell">
              {busy ? COMPOSE_STATUS_LABELS[txStatus] ?? 'Working…' : 'Open dispenser'}
            </ConnectCTA>
            <p className="text-center text-[11px] text-zinc-500">
              Escrowed tokens leave your balance until the dispenser is emptied or closed.
            </p>
          </PanelSection>
        </Panel>

        {onAssetChange && (
          <AssetSelect
            open={selectorOpen}
            onOpenChange={setSelectorOpen}
            onSelect={(next, longname) => {
              setPrice('')
              onAssetChange(next, longname)
            }}
            // Not `dispensers`: opening a dispenser CREATES the market, so
            // restricting the picker to assets that already have one would
            // rule out the entire reason for being on this form. Browses
            // your own balances — you can only escrow what you hold — and
            // searches every asset that exists.
            source="holdings"
          />
        )}
      </div>

      {showLadder && (
      <DispenserList
        mode="sell"
        dispensers={dispensers}
        isLoading={dispensersLoading}
        yourPrice={price}
        yourEscrow={escrow}
        onPickPrice={setPrice}
      />
      )}
    </div>
  )
}

/** A dispenser's own page on the explorer. */
function ExplorerLink({ txHash }: { txHash: string }) {
  return (
    <a
      href={`https://xcp.io/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View dispenser on xcp.io"
      onClick={(e) => e.stopPropagation()}
      className="relative z-10 shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
    >
      <svg
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3"
      >
        <path d="M5 2H2.5A.5.5 0 0 0 2 2.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V7M7 2h3v3M10 2 5.5 6.5" />
      </svg>
    </a>
  )
}

const ROWS = 10

/**
 * The ask ladder that sits beside the form — the same rows on both sides,
 * doing opposite jobs.
 *
 * Buying, it is a readout: the form has already picked which dispenser the
 * payment goes to, so the list highlights that one and shows what it is
 * taking. There is nothing to click, because a dispense pays one address and
 * choosing a dearer one is not a decision worth offering.
 *
 * Selling, it is the competition, and every row IS clickable — tapping one
 * copies its price into the form, which is how you match or undercut it.
 * Prices are per token so rows compare even when their lot sizes differ.
 */
export function DispenserList({
  dispensers,
  isLoading,
  mode,
  activeIndex = -1,
  takingTokens = 0,
  contested,
  pinned = false,
  yourPrice = '',
  yourEscrow = '',
  onPickPrice,
  onPickDispenser,
}: {
  dispensers: Dispenser[]
  isLoading: boolean
  mode: 'buy' | 'sell'
  /** buy: the dispenser the form routed to. */
  activeIndex?: number
  /** Dispenser tx hashes with an unconfirmed buy against them. */
  contested?: Set<string>
  /** buy: tokens coming out of that dispenser. */
  takingTokens?: number
  /** buy: the route came from ?address= rather than from price. */
  pinned?: boolean
  /** sell: your price per token, in BTC. */
  yourPrice?: string
  /** sell: how much you're escrowing, for the marker row. */
  yourEscrow?: string
  onPickPrice?: (price: string) => void
  /**
   * buy: only supplied when there is exactly ONE dispenser, where there is no
   * routing decision left for a click to misrepresent. See the call site.
   */
  onPickDispenser?: () => void
}) {
  const { satsMode } = useSatsMode()
  const rows = dispensers.slice(0, ROWS)
  const depths = rows.map((d) => big(d.give_remaining_normalized))
  const maxDepth = depths.reduce((a, b) => (b.isGreaterThan(a) ? b : a), big(0))
  const bar = (i: number) =>
    maxDepth.isGreaterThan(0) ? Math.max(6, num(depths[i].dividedBy(maxDepth).times(100))) : 6

  // Where your ask would land. Equal prices are shown above yours: they were
  // there first, and a buyer comparing two identical asks has no reason to
  // take the newer one.
  const yours = big(yourPrice)
  const priced = mode === 'sell' && yours.isFinite() && yours.isGreaterThan(0)
  const rank = priced
    ? dispensers.filter((d) => big(d.price_normalized).isLessThanOrEqualTo(yours)).length
    : 0
  const markerAt = Math.min(rank, rows.length)

  const row = (d: Dispenser, i: number) => {
    const active = mode === 'buy' && i === activeIndex
    const busy = mode === 'buy' && !!contested?.has(d.tx_hash)
    // Below a satoshi per token there is nothing to copy into an 8-decimal
    // BTC field, so those rows stay read-only rather than setting a zero.
    const pick = big(d.price_normalized).toFixed(8, ROUND_DOWN)
    const pickable = mode === 'sell' && !!onPickPrice && big(pick).isGreaterThan(0)
    /**
     * Buy rows are clickable only in the single-dispenser case, and only while
     * the row is still worth taking — a contested or empty one would set an
     * amount the purchase cannot fill.
     */
    const takeable =
      mode === 'buy' && !!onPickDispenser && !busy && big(d.give_remaining_normalized).isGreaterThan(0)
    const activate = pickable ? () => onPickPrice!(pick) : takeable ? onPickDispenser : undefined
    const body = (
      <>
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 rounded-lg ${active ? 'bg-green-500/15' : 'bg-zinc-800/60'}`}
          style={{ width: `${bar(i)}%` }}
        />
        <span className="relative z-10 flex w-full items-baseline justify-between gap-2">
          <span
            className={`font-medium tabular-nums ${
              active ? 'text-zinc-100' : busy ? 'text-zinc-600 line-through' : 'text-zinc-300'
            }`}
            // Struck through rather than removed: an unconfirmed dispense can
            // be replaced or dropped, and a row that silently disappears is a
            // worse lie than one that says it is being drained.
            title={busy ? 'Unconfirmed buy in flight — may be empty next block' : undefined}
          >
            {formatPrice(d.price_normalized, satsMode)}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="tabular-nums text-zinc-500">
              {active && takingTokens > 0 && (
                <span className="font-medium text-green-400">{formatAmount(takingTokens)} of </span>
              )}
              {formatAmount(d.give_remaining_normalized)}
            </span>
            <ExplorerLink txHash={d.tx_hash} />
          </span>
        </span>
      </>
    )
    const shell = `relative flex w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
      active ? 'border-green-500/40' : 'border-transparent'
    }`
    return (
      <li key={d.tx_hash}>
        {activate ? (
          <button
            type="button"
            onClick={activate}
            title={takeable ? 'Buy from this dispenser' : undefined}
            className={`${shell} hover:border-zinc-700 hover:bg-zinc-800/30`}
          >
            {body}
          </button>
        ) : (
          <div className={shell}>{body}</div>
        )}
      </li>
    )
  }

  return (
    <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-baseline justify-between px-2">
        <h2 className="text-xs text-zinc-400">
          {mode === 'buy' ? 'Dispensers' : 'Open asks'} · cheapest first
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-zinc-600">
          {satsMode ? 'sats' : 'BTC'}/unit
        </span>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-xs text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">None open</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.slice(0, markerAt).map((d, i) => row(d, i))}
          {priced && (
            <li>
              <div className="relative flex w-full overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs">
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="font-medium tabular-nums text-amber-300">
                    {formatPrice(yourPrice, satsMode)}
                  </span>
                  <span className="tabular-nums text-amber-400/80">
                    {num(yourEscrow) > 0 ? `you · ${formatAmount(yourEscrow)}` : 'you'}
                  </span>
                </span>
              </div>
            </li>
          )}
          {rows.slice(markerAt).map((d, i) => row(d, i + markerAt))}
        </ul>
      )}
      <p className="mt-2 px-2 text-[11px] leading-snug text-zinc-500">
        {mode === 'buy' ? (
          pinned ? (
            <>You followed a link to this dispenser. Clear the link to buy from the cheapest instead.</>
          ) : (
            <>One payment reaches one dispenser, so your order goes to the cheapest that holds all of it.</>
          )
        ) : (
          <>
            Buyers can pay whichever dispenser they like, so a lower ask doesn&apos;t jump a queue — it
            just makes yours the one most of them take. Tap a row to match its price.
          </>
        )}
      </p>
    </aside>
  )
}
