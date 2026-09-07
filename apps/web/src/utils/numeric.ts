import BigNumber from 'bignumber.js'
import { parseAmountDraft, rawToInput, parseRawInteger } from '@xcp/wallet-sdk/amounts'

/**
 * Counterparty quantities are integers in one of exactly two scales: a
 * divisible asset has 8 decimal places (1 unit = 100_000_000 base units), an
 * indivisible one has none (1 unit = 1). There is no third case and no
 * per-asset decimals field — only the boolean.
 *
 * Every mistake here is the same mistake: applying the wrong scale, which is
 * off by a factor of 100 million and silently signs for the wrong amount. A
 * pair mixes scales freely — XCP is divisible, most cards and stamps are not
 * — so div/div, div/indiv, indiv/div and indiv/indiv all occur and each leg
 * must convert with ITS OWN flag, never the pair's.
 *
 * Arithmetic goes through BigNumber (already a dependency, and what
 * utils/trading-pair.ts already uses) rather than through doubles. The
 * conventions below are lifted from the wallet extension's core/numeric,
 * which is the most exercised version of this in the codebase:
 *
 *   - Typed amounts are never rounded. Derived bounds name their direction:
 *     spend ceilings round down, receive floors round up.
 *   - No scientific notation. `String(1e21)` is "1e+21", which Counterparty
 *     will reject or misread; toFixed() keeps plain digits.
 *   - Base units leave as STRINGS. Above 2^53 a JS number cannot hold them
 *     exactly, and a quantity is a value someone signs.
 *
 * Rounding alone is not enough, which is why toBase returns a result rather
 * than a number. Measured against the naive `Math.round(x * 1e8)` path:
 *
 *   indivisible, typed 1.5  -> 2   (more than the user asked for)
 *   indivisible, typed 0.4  -> 0   (an order for nothing)
 *   divisible, 9 decimals   -> quietly rounds off the ninth
 *
 * And the last rule: unknown divisibility is not "probably divisible". It
 * reports `unknown-divisibility` and callers must refuse to submit, because
 * guessing wrong is the 100-million-fold error rather than a cosmetic one.
 */

/**
 * Parse anything numeric into an exact BigNumber.
 *
 * The one entry point, so nothing reaches for `parseFloat` and there is a
 * single answer to "what does this string mean". A string from the lossless
 * JSON parse keeps every digit; a bad value becomes NaN rather than throwing,
 * and `isFinite()` is how callers check.
 *
 * Benchmarked before adopting it everywhere: ~830ns for parse + compare +
 * format versus ~90ns for parseFloat. A heavy 500-cell table render costs
 * 0.41ms against a 16.7ms frame — consistency is worth far more than that.
 */
export function big(value: string | number | BigNumber | null | undefined): BigNumber {
  if (value == null || value === '') return new BigNumber(NaN)
  return BigNumber.isBigNumber(value) ? value : new BigNumber(value)
}

/** A display number from any numeric input. Zero when the value is unusable. */
export function num(value: string | number | BigNumber | null | undefined): number {
  const b = big(value)
  return b.isFinite() ? b.toNumber() : 0
}

/** Whether a value is usable as a positive quantity. */
export function isPositive(value: string | number | BigNumber | null | undefined): boolean {
  const b = big(value)
  return b.isFinite() && b.isGreaterThan(0)
}

/** Re-exported so callers never import BigNumber just for a rounding mode. */
export const ROUND_DOWN = BigNumber.ROUND_DOWN

export const DIVISIBLE_DECIMALS = 8

/**
 * Satoshis <-> BTC. Bitcoin is always 8 decimals, whatever the Counterparty
 * asset on the other leg is, so these are separate from the divisibility
 * helpers below and never take a flag.
 *
 * A decimal-point shift rather than `/ 1e8`, so a large satoshi value keeps
 * its digits instead of being handed to a double first.
 */
export function fromSats(sats: string | number | null | undefined): number {
  return num(big(sats).shiftedBy(-DIVISIBLE_DECIMALS))
}

export function toSats(btc: string | number | null | undefined): number {
  return num(big(btc).shiftedBy(DIVISIBLE_DECIMALS))
}

/**
 * Counterparty's largest quantity: 2^63 - 1, the signed 64-bit ceiling
 * (`config.MAX_INT` in counterparty-core). Anything above it is rejected by
 * consensus, so composing it wastes a fee to have the transaction refused.
 * Caught here instead, with a message.
 */
export const MAX_INT = new BigNumber('9223372036854775807')

/** Decimal places for an asset. Undefined divisibility has no answer. */
export function decimalsFor(divisible: boolean | undefined): number | undefined {
  return divisible === undefined ? undefined : divisible ? DIVISIBLE_DECIMALS : 0
}

export type RawError =
  | 'unknown-divisibility'
  | 'not-a-number'
  | 'negative'
  | 'fractional-indivisible'
  | 'too-many-decimals'
  | 'above-max-int'

export type RawResult =
  | {
      ok: true
      /** Base units as exact digits — the form to send and to sign. */
      base: string
      /** Same value as a number, for comparisons and display only. */
      raw: number
    }
  | { ok: false; error: RawError }

/**
 * A human-typed amount as base units.
 *
 * Rejects rather than rounds: an amount with more precision than the asset
 * can represent is a user mistake worth surfacing, not something to quietly
 * truncate under a value they are about to sign.
 */
export function toBase(amount: string, divisible: boolean | undefined): RawResult {
  if (divisible === undefined) return { ok: false, error: 'unknown-divisibility' }
  const parsed = parseAmountDraft(amount, { decimals: divisible ? 8 : 0 })
  if (parsed.status === 'valid') {
    return { ok: true, base: parsed.raw.toString(), raw: Number(parsed.raw) }
  }
  const error = parsed.status === 'invalid' && parsed.code === 'amount_precision'
    ? divisible ? 'too-many-decimals' : 'fractional-indivisible'
    : parsed.status === 'invalid' && parsed.code === 'amount_range'
      ? 'above-max-int'
      : 'not-a-number'
  return { ok: false, error }
}

/**
 * Base units back to a human decimal string. Exact, and never in scientific
 * notation — safe to put in an input or show on screen.
 */
export function fromBase(base: string | number, divisible: boolean | undefined): string {
  if (divisible === undefined) return ''
  try {
    return rawToInput(base, divisible ? 8 : 0)
  } catch {
    return ''
  }
}

/** Base units as a display number. For comparisons and formatting, never to re-encode. */
export function fromBaseNumber(base: string | number, divisible: boolean | undefined): number {
  const decimals = decimalsFor(divisible)
  if (decimals === undefined) return 0
  const value = new BigNumber(base)
  return value.isFinite() ? value.shiftedBy(-decimals).toNumber() : 0
}

/**
 * Multiply a base-unit quantity by a plain ratio (a slippage haircut, a
 * percentage), rounding DOWN so the result is never more than intended.
 */
export function scaleBase(base: string | number, factor: number | string): string {
  const ratio = big(factor)
  if (!ratio.isFinite() || ratio.isNegative() || ratio.isGreaterThan(1)) return '0'
  try {
    return big(parseRawInteger(base).toString()).times(ratio).integerValue(BigNumber.ROUND_DOWN).toFixed(0)
  } catch {
    return '0'
  }
}

/**
 * A slippage-adjusted protocol minimum, which must remain positive for a positive quote.
 *
 * One indivisible output unit has no fractional unit to absorb a percentage haircut: flooring
 * `1 × 0.97` produces zero, and Counterparty correctly rejects that as a non-positive get
 * quantity. In that one-base-unit case the only representable minimum is one. A zero/negative
 * factor still returns zero so this helper remains explicit about a 100%+ tolerance.
 */
export function minimumBase(base: string | number, factor: number | string): string {
  try { parseRawInteger(base) } catch { return '0' }
  const ratio = big(factor)
  if (!ratio.isFinite() || ratio.isLessThanOrEqualTo(0) || ratio.isGreaterThan(1)) return '0'
  const scaled = scaleBase(base, factor)
  return big(base).isGreaterThan(0) && scaled === '0' ? '1' : scaled
}

/** Subtract the percentage in decimal arithmetic before multiplying raw
 * units; a binary `1 - percent / 100` can shift a large minimum by units. */
export function slippageMinimum(base: string | number, percent: number): string {
  return minimumBase(base, big(100).minus(percent).dividedBy(100).toFixed())
}

/**
 * PRICE × AMOUNT as base units of the quote asset.
 *
 * Done in human units and converted once. Multiplying two already-scaled
 * integers would be wrong by a factor of 1e8, which is the classic limit-order
 * bug. Derived precision is rounded in the caller's specified direction, because the
 * total is derived rather than typed — the user never chose those digits.
 */
export function totalToBase(
  price: string,
  amount: string,
  quoteDivisible: boolean | undefined,
  rounding: 'floor' | 'ceil' = 'floor',
): RawResult {
  const decimals = decimalsFor(quoteDivisible)
  if (decimals === undefined) return { ok: false, error: 'unknown-divisibility' }
  const grammar = { decimals: 8 as const, maxRaw: 922337203685477580700000000n }
  if (parseAmountDraft(price, grammar).status !== 'valid' || parseAmountDraft(amount, grammar).status !== 'valid') {
    return { ok: false, error: 'not-a-number' }
  }
  const p = new BigNumber(price)
  const a = new BigNumber(amount)
  const base = p.times(a).shiftedBy(decimals).integerValue(rounding === 'floor' ? BigNumber.ROUND_FLOOR : BigNumber.ROUND_CEIL)
  if (base.isGreaterThan(MAX_INT)) return { ok: false, error: 'above-max-int' }
  return { ok: true, base: base.toFixed(0), raw: base.toNumber() }
}

/** Message for a failed conversion, phrased for the person who typed it. */
export function rawErrorMessage(error: RawError, asset: string): string {
  switch (error) {
    case 'unknown-divisibility':
      return `Still loading ${asset}'s details — one moment.`
    case 'fractional-indivisible':
      return `${asset} is indivisible: whole units only, no decimals.`
    case 'too-many-decimals':
      return `${asset} supports at most ${DIVISIBLE_DECIMALS} decimal places.`
    case 'above-max-int':
      return `That amount is larger than Counterparty can represent — the ceiling is 2^63-1 base units.`
    case 'negative':
      return 'Enter a positive amount.'
    case 'not-a-number':
      return 'Enter a complete amount using digits and a period. Do not use commas, spaces, signs, or exponent notation.'
  }
}

/**
 * Keep every edit visible. Validation, not an input mask, decides whether
 * a draft may be quoted or composed. Dropping a character from "-5" or
 * "1e5" silently turns the following keystrokes into a different amount.
 */
export function sanitizeAmountInput(value: string): string {
  return value
}
