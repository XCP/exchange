'use client'

import { useEffect, useRef, useState } from 'react'
import { useWallet } from './wallet-context'
import { friendlyError, BTC_ADDRESS_REGEX } from './sdk'
import { parseTxInputs, type TxInput } from './raw-tx'
import { msSinceLastSpend, recentlySpentUtxos, registerSpentUtxos } from './spent-utxos'
import { quantityParam } from '@/utils/quantity-param'
import { COUNTERPARTY_API_BASE } from '@/utils/constants'
import { PRECISE_FEES_URL, feeRateFrom } from '@/lib/hooks/useNetworkInfo'
import { trackTx } from '@/lib/analytics'

/** A compose parameter value; bigint/string carry quantities beyond 2^53. */
type ComposeValue = string | number | bigint

/**
 * A caller-supplied quantity in BASE UNITS.
 *
 * Strings are the preferred form and what utils/numeric produces: above
 * 2^53 a JS number cannot hold a quantity exactly, and this is the value the
 * user signs. Numbers past that range are refused by quantityParam rather
 * than silently rounded.
 */
type Quantity = string | number | bigint

const UTXO_REGEX = /^[a-f0-9]{64}:\d+$/

/** friendlyError's catch-all — the one message that says nothing at all. */
const GENERIC_ERROR = 'Something went wrong — please try again'

/**
 * Core reports compose failures as a Python repr of a list, even for one
 * error: `['insufficient XCP balance to pay fee', 'lp_asset must be a
 * numeric asset']`. Unwrapped into `a; b`, because the brackets and quotes
 * are noise and — more importantly — because the SECOND error is the one
 * that usually explains the failure. Anything that isn't that shape is
 * returned unchanged.
 */
function normalizeCoreError(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(String).join('; ')
  const text = typeof raw === 'string' ? raw.trim() : ''
  const list = /^\[(.*)\]$/s.exec(text)
  if (!list) return text
  // An empty list carries no information; let the caller's fallback speak.
  if (list[1]!.trim() === '') return ''
  const parts = [...list[1]!.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map(
    (m) => (m[1] ?? m[2] ?? '').replace(/\\(['"\\])/g, '$1'),
  )
  return parts.length > 0 ? parts.join('; ') : text
}

/**
 * The friendly message when one fits, the REAL one when none does.
 *
 * friendlyError's fallback is a dead end: it tells a user nothing and leaves
 * the only copy of the reason in a console.warn, which is no use to someone
 * who hit this on a trade and doesn't have devtools open. Core's compose
 * errors are specific and actionable — "insufficient XCP balance to pay fee",
 * "quantity must be an integer" — and an unrecognised error is exactly the
 * case where raw text beats polish.
 *
 * Recognised errors keep their friendly wording; this only replaces the
 * catch-all. friendlyError still logs, so nothing stops being debuggable.
 */
function composeError(e: unknown): string {
  const friendly = friendlyError(e)
  if (friendly !== GENERIC_ERROR) return friendly

  const raw = (e instanceof Error ? e.message : String(e)).trim()

  // The one core error worth naming ourselves, because it is the first-timer
  // failure and its own words don't say what's missing. "no utxos found for
  // 1ABC…" contains none of friendlyError's keywords — not even
  // "insufficient" — so it fell all the way through to the catch-all, which
  // is how someone funded with XCP but no bitcoin got told nothing at all.
  // XCP pays Counterparty's fee; bitcoin pays the miners; a wallet holding
  // only the first cannot build a transaction.
  if (NO_SPENDABLE_BTC_PATTERN.test(raw)) {
    return 'No spendable bitcoin at this address — every transaction needs BTC for the miner fee, on top of any XCP it spends.'
  }

  return raw && raw !== '[object Object]' ? raw : friendly
}

export type ComposeStatus = 'idle' | 'composing' | 'signing' | 'broadcasting' | 'confirmed' | 'error'

export type ComposeState =
  | { status: 'idle'; txid: null; error: null }
  | { status: 'composing'; txid: null; error: null }
  | { status: 'signing'; txid: null; error: null }
  | { status: 'broadcasting'; txid: null; error: null }
  | { status: 'confirmed'; txid: string; error: null }
  | { status: 'error'; txid: null; error: string }

const INITIAL_STATE: ComposeState = { status: 'idle', txid: null, error: null }

// core's own error text (composer.py) for "the selected UTXOs don't cover
// this" — matched narrowly so this retry never masks a wallet that's
// actually empty, only the propagation-lag window right after our own
// broadcast (see spent-utxos.ts's msSinceLastSpend doc comment).
const INSUFFICIENT_UTXO_PATTERN = /insufficient funds for the target amount|no utxos found for/i
const UTXO_RACE_RETRY_WINDOW_MS = 8_000
const UTXO_RACE_RETRY_DELAY_MS = 2_000

// Core complaining about the UTXOs it selected itself — the shapes the wallet
// extension's own compose fallback matches on. Distinct from the "insufficient
// funds" race above: that one is a timing gap, this one is a selection core
// will keep making until it is told to stop looking at its mempool.
const STALE_UTXO_PATTERN = /invalid UTXOs|UTXO not found|transaction not found/i

// Core's way of saying the address has nothing to spend. Deliberately NOT
// matching "insufficient funds for the target amount", which is the race
// above and means the coins exist but aren't visible yet.
const NO_SPENDABLE_BTC_PATTERN = /no utxos found for|no unspent outputs/i

/** One bounded, invisible retry for the UTXO-propagation race: if we JUST
 *  broadcast something and the very next compose fails with exactly the
 *  "not enough" shape core raises when it can't cover the amount, wait a
 *  beat and try again once before surfacing anything to the user. Anything
 *  else — a different error, or a wallet that's simply been empty for
 *  longer than that window — passes straight through. */
async function withUtxoRaceRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const sinceSpend = msSinceLastSpend()
    if (
      INSUFFICIENT_UTXO_PATTERN.test(msg) &&
      sinceSpend !== null &&
      sinceSpend < UTXO_RACE_RETRY_WINDOW_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, UTXO_RACE_RETRY_DELAY_MS))
      return fn()
    }
    throw e
  }
}

/**
 * The rate Auto composes at, from the same endpoint and the same parser the
 * header and the gear display (see lib/hooks/useNetworkInfo).
 *
 * They used to disagree, and expensively. This read took `mempool-blocks[0]
 * .medianFee` and then applied `Math.max(Math.round(x), 1)`, so a mempool
 * offering 0.57 sat/vB was composed at 1 — roughly double, while the form
 * displayed 0.57. Counterparty accepts a fractional `sat_per_vbyte` and prices
 * it exactly (238 vsize at 0.5 = 119 sats), so neither the rounding nor the
 * floor of 1 was buying anything. The floor now comes from the network's own
 * reported minimum, which is 0.1 today and was 1 when that constant was
 * written.
 *
 * Cached 30s in module scope rather than through SWR: compose is a one-shot
 * call from an event handler, not a subscription.
 */
let cachedFeeRate: number | null = null
let feeRateTimestamp = 0

/** Used only if mempool.space is unreachable on the very first compose. */
const FEE_RATE_FALLBACK = 2

export async function fetchMedianFeeRate(): Promise<number> {
  const now = Date.now()
  if (cachedFeeRate && now - feeRateTimestamp < 30_000) return cachedFeeRate
  try {
    const res = await fetch(PRECISE_FEES_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const rate = feeRateFrom(await res.json())
    if (rate == null) throw new Error('unusable fee response')
    cachedFeeRate = rate
    feeRateTimestamp = now
    return cachedFeeRate
  } catch {
    return cachedFeeRate ?? FEE_RATE_FALLBACK
  }
}

/**
 * Call Counterparty compose endpoint. Every quantity the user signs passes
 * through this loop, so serialization is gated by quantityParam: String() on
 * an unsafe double would put wrong digits (or exponent notation) into the
 * transaction. Non-numeric params are strings and pass through unchanged.
 */
async function composeRequest(
  path: string,
  type: string,
  params: Record<string, ComposeValue>,
  extraParams?: Record<string, string>,
  feeRateOverride?: number,
): Promise<string> {
  const feeRate = feeRateOverride ?? (await fetchMedianFeeRate())
  const qp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    try {
      qp.set(k, quantityParam(v))
    } catch (e) {
      throw new Error(
        `${k}: ${e instanceof Error ? e.message : 'unusable value'}`,
      )
    }
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) qp.set(k, v)
  }
  qp.set('sat_per_vbyte', String(feeRate))
  qp.set('verbose', 'true')

  const url = `${COUNTERPARTY_API_BASE}/${path}/compose/${type}?${qp.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const data = await res.json()

  if (!res.ok || data.error) {
    throw new Error(normalizeCoreError(data.error) || `Compose failed: ${res.status}`)
  }

  return data.result.rawtransaction
}

export function useCompose() {
  const { address, publicKey, signTransaction, broadcastTransaction } = useWallet()
  const [state, setState] = useState<ComposeState>(INITIAL_STATE)
  const busyRef = useRef(false)

  // A stale error (e.g. "Wallet not authorized") shouldn't outlive the
  // condition that caused it. Connecting, switching, or disconnecting the
  // wallet clears it automatically instead of waiting for the user to
  // resubmit the exact same action.
  const lastAddressRef = useRef(address)
  useEffect(() => {
    if (lastAddressRef.current !== address) {
      lastAddressRef.current = address
      setState((s) => (s.status === 'error' ? INITIAL_STATE : s))
    }
  }, [address])

  /**
   * Compose → sign → broadcast pipeline. `getUnsigned` returns both the hex
   * to sign and the inputs it spends — recorded as spent only once broadcast
   * actually succeeds (composing alone spends nothing), so the NEXT compose
   * can tell core to exclude them regardless of which backend worker
   * answers it. See spent-utxos.ts for why that matters.
   */
  /**
   * Every broadcast on the site funnels through here, so this is the one
   * place a conversion can be reported without a widget having to remember
   * to. `label` is the compose type — order, dispense, pooldeposit — which is
   * already the name of the thing the user just did.
   */
  const run = async (
    getUnsigned: () => Promise<{ hex: string; inputs: TxInput[] }>,
    label?: string,
  ): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true

    try {
      setState({ status: 'composing', txid: null, error: null })
      const { hex: unsignedHex, inputs } = await withUtxoRaceRetry(getUnsigned)

      setState({ status: 'signing', txid: null, error: null })
      const signedHex = await signTransaction(unsignedHex)

      setState({ status: 'broadcasting', txid: null, error: null })
      const txid = await broadcastTransaction(signedHex)

      registerSpentUtxos(inputs)
      // Deduped on the txid inside trackTx, so a re-render or a reload with
      // the confirmation still on screen cannot double-count it.
      if (label) trackTx(txid, label)
      setState({ status: 'confirmed', txid, error: null })
    } catch (e) {
      setState({ status: 'error', txid: null, error: composeError(e) })
    } finally {
      busyRef.current = false
    }
  }

  const execute = (
    type: string,
    params: Record<string, ComposeValue>,
    feeRateOverride?: number,
  ): void => {
    if (!address) {
      setState({ status: 'error', txid: null, error: 'Wallet not connected' })
      return
    }
    if (!BTC_ADDRESS_REGEX.test(address)) {
      setState({ status: 'error', txid: null, error: 'Invalid wallet address' })
      return
    }
    const excludeUtxos = recentlySpentUtxos()
    const composeWith = (allowUnconfirmed: boolean) =>
      composeRequest(
        `addresses/${address}`,
        type,
        params,
        {
          exclude_utxos_with_balances: 'true',
          // Without this, core's UTXO selection (list_unspent) only offers
          // already-CONFIRMED UTXOs. The moment one compose is pending, its
          // change output is unconfirmed and invisible to the next one — a
          // wallet with no other confirmed UTXOs reads as "not enough
          // BTC/XCP" for a second action, even though chaining off that
          // change is exactly what a real wallet does. This is what lets a
          // user place an order, then another, back to back.
          allow_unconfirmed_inputs: allowUnconfirmed ? 'true' : 'false',
          // Belt-and-suspenders against the SAME UTXO being offered twice in
          // quick succession: core's own UTXOLocks guard is an in-memory,
          // per-process singleton that explicitly does not cross workers, so
          // two composes moments apart can land on different backend
          // processes that have never heard of each other's selection. This
          // excludes whatever WE know we just spent, regardless of which
          // worker answers.
          ...(excludeUtxos.length > 0 ? { exclude_utxos: excludeUtxos.join(',') } : {}),
          // Harmless when it isn't needed: core reads this only if the
          // message is too big for an OP_RETURN and it falls back to
          // multisig, so most composes ignore it entirely.
          ...(publicKey ? { multisig_pubkey: publicKey } : {}),
        },
        feeRateOverride,
      )

    run(async () => {
      let hex: string
      try {
        hex = await composeWith(true)
      } catch (e) {
        // The cost of allow_unconfirmed_inputs, and the fallback the wallet
        // extension already runs: core can offer a UTXO from its own mempool
        // view and then refuse the very selection it made, which surfaces as
        // a dead end on an address whose CONFIRMED coins would have composed
        // fine. Dropping to confirmed-only gives up chaining off pending
        // change — but only after the unconfirmed attempt has already
        // failed, so it costs nothing that was working.
        if (!STALE_UTXO_PATTERN.test(e instanceof Error ? e.message : String(e))) throw e
        hex = await composeWith(false)
      }
      return { hex, inputs: parseTxInputs(hex) }
    }, type)
  }

  const executeUtxo = (utxo: string, type: string, params: Record<string, ComposeValue>): void => {
    if (!address) {
      setState({ status: 'error', txid: null, error: 'Wallet not connected' })
      return
    }
    if (!UTXO_REGEX.test(utxo)) {
      setState({ status: 'error', txid: null, error: 'Invalid UTXO format' })
      return
    }
    // Targets one exact, caller-specified UTXO — no ambiguous selection to
    // race, so nothing to record here.
    run(async () => {
      const hex = await composeRequest(`utxos/${utxo}`, type, params)
      return { hex, inputs: [] }
    }, type)
  }

  const composeOrder = (params: {
    give_asset: string
    give_quantity: Quantity
    get_asset: string
    get_quantity: Quantity
    expiration?: number
    /** sat/vB override; defaults to the next-block median at compose time. */
    fee_rate?: number
  }) => execute('order', {
    give_asset: params.give_asset,
    give_quantity: params.give_quantity,
    get_asset: params.get_asset,
    get_quantity: params.get_quantity,
    expiration: params.expiration ?? 5000,
    fee_required: 0,
  }, params.fee_rate)

  const composeDispenser = (params: {
    asset: string
    give_quantity: Quantity
    escrow_quantity: Quantity
    mainchainrate: Quantity
    status?: number
    /** sat/vB override; defaults to the next-block median at compose time. */
    fee_rate?: number
  }) => execute('dispenser', {
    asset: params.asset,
    give_quantity: params.give_quantity,
    escrow_quantity: params.escrow_quantity,
    mainchainrate: params.mainchainrate,
    status: params.status ?? 0,
  }, params.fee_rate)

  const composeDispense = (params: {
    dispenser: string
    quantity: Quantity
    /** sat/vB override; defaults to the next-block median at compose time. */
    fee_rate?: number
  }) => execute('dispense', {
    dispenser: params.dispenser,
    quantity: params.quantity,
  }, params.fee_rate)

  const composeAttach = (params: {
    asset: string
    quantity: Quantity
  }) => execute('attach', {
    asset: params.asset,
    quantity: params.quantity,
  })

  const composePoolDeposit = (params: {
    asset_a: string
    asset_b: string
    quantity_a: Quantity
    quantity_b: Quantity
    min_lp_quantity?: Quantity
    lp_asset?: string
    /** sat/vB override; defaults to the next-block median at compose time. */
    fee_rate?: number
  }) => execute('pooldeposit', {
    asset_a: params.asset_a,
    asset_b: params.asset_b,
    quantity_a: params.quantity_a,
    quantity_b: params.quantity_b,
    min_lp_quantity: params.min_lp_quantity ?? 0,
    ...(params.lp_asset ? { lp_asset: params.lp_asset } : {}),
  }, params.fee_rate)

  const composePoolWithdraw = (params: {
    lp_asset: string
    quantity: Quantity
    min_quantity_a?: Quantity
    min_quantity_b?: Quantity
    /** sat/vB override; defaults to the next-block median at compose time. */
    fee_rate?: number
  }) => execute('poolwithdraw', {
    lp_asset: params.lp_asset,
    quantity: params.quantity,
    min_quantity_a: params.min_quantity_a ?? 0,
    min_quantity_b: params.min_quantity_b ?? 0,
  }, params.fee_rate)

  const composeDetach = (utxo: string) => executeUtxo(utxo, 'detach', {})

  /** Cancel an open DEX order by its transaction hash. */
  const composeCancel = (params: { offer_hash: string }) =>
    execute('cancel', { offer_hash: params.offer_hash })

  const reset = () => setState(INITIAL_STATE)

  return {
    ...state,
    composeOrder,
    composeDispenser,
    composeDispense,
    composeAttach,
    composePoolDeposit,
    composePoolWithdraw,
    composeDetach,
    composeCancel,
    reset,
  }
}
