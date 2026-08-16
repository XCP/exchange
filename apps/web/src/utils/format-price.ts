import BigNumber from 'bignumber.js'
import { formatCommas } from '@/utils/format-commas'
import { big, DIVISIBLE_DECIMALS, ROUND_DOWN } from '@/utils/numeric'

/**
 * Price/amount display in BTC or sats.
 *
 * Parsed with BigNumber rather than parseFloat so a large exact string from
 * the lossless JSON parse keeps its digits, and so the sats conversion is a
 * decimal-point shift instead of a float multiply. Rounding is DOWN
 * throughout, matching utils/numeric: a displayed quantity should never
 * read as more than someone actually has.
 */
export function formatPrice(amount: string | number, sats: boolean = false): string {
  if (amount === null || amount === undefined) {
    return 'N/A'
  }

  const value = new BigNumber(amount)
  if (!value.isFinite()) return 'N/A'
  const num = value.toNumber()

  if (sats) {
    // shiftedBy is exact; `num * 1e8` is not.
    const satBn = value.shiftedBy(8)
    const satVal = satBn.toNumber()
    if (satVal >= 1_000_000_000) {
      return (satVal / 1_000_000_000).toFixed(2) + 'B'
    } else if (satVal >= 1_000_000) {
      return (satVal / 1_000_000).toFixed(2) + 'M'
    } else if (satVal >= 1_000) {
      return formatCommas(satBn.integerValue(BigNumber.ROUND_DOWN).toFixed(0))
    } else if (satVal >= 1) {
      return satVal.toFixed(satVal < 10 ? 2 : 0)
    } else if (satVal > 0) {
      return satVal.toPrecision(2)
    }
    return '0'
  }

  if (num >= 1_000_000_000_000_000) {
    return (num / 1_000_000_000_000_000).toFixed(2) + 'Q'
  } else if (num >= 1_000_000_000_000) {
    return (num / 1_000_000_000_000).toFixed(2) + 'T'
  } else if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B'
  }

  let formattedNumber: string

  if (num < 1) {
    if (num > 0 && num < 0.000000005) {
      // Find how many decimals needed to show 2 significant digits
      const digits = Math.ceil(-Math.log10(num)) + 1
      formattedNumber = num.toFixed(digits)
    } else {
      formattedNumber = num.toFixed(8)
    }
  } else {
    formattedNumber = num.toFixed(8)
  }

  return formatCommas(formattedNumber)
}

/**
 * A bitcoin amount, in whichever unit the header toggle is set to.
 *
 * BTC is the default and always shows all eight decimals — "1.00000000"
 * rather than "1". A dispenser price is frequently in the last few of those
 * places, so a trimmed number would hide exactly the digits that differ
 * between two dispensers. Sats mode drops the fraction entirely, because
 * satoshis are integers by definition.
 *
 * Diverges from launchpad, which is sats-only. The header toggle exists here
 * and this respects it.
 */
export function formatBtcAmount(
  amount: string | number | null | undefined,
  satsMode: boolean,
  withUnit: boolean = true,
): string {
  const value = big(amount)
  if (!value.isFinite()) return withUnit ? (satsMode ? '0 sats' : '0.00000000 BTC') : '0'
  if (satsMode) {
    const sats = value.shiftedBy(DIVISIBLE_DECIMALS).integerValue(ROUND_DOWN)
    return `${formatCommas(sats.toFixed(0))}${withUnit ? ' sats' : ''}`
  }
  return `${value.toFixed(DIVISIBLE_DECIMALS, ROUND_DOWN)}${withUnit ? ' BTC' : ''}`
}
