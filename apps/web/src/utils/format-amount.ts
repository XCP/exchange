import BigNumber from 'bignumber.js'

/**
 * Display formatting for a quantity.
 *
 * Accepts strings without going through a double first. That matters since
 * the lossless JSON parse (lib/api/lossless-json) hands back any integer
 * above 2^53 as a string precisely so its digits survive — running
 * `parseFloat` on it here would throw away what that parse preserved.
 *
 * Abbreviated magnitudes (K/M/B/T/Q) stay approximate on purpose: "1.23M" is
 * a summary, and no one reads the eleventh digit of it. Everything below the
 * abbreviation threshold is rendered exactly.
 */
export function formatAmount(
  amount: string | number | null | undefined,
  usd: boolean = false,
  pct: boolean = false,
): string {
  if (amount === null || amount === undefined) return 'N/A'

  const value = new BigNumber(amount)
  if (!value.isFinite()) return 'N/A'

  const abbreviations: [BigNumber, string][] = [
    [new BigNumber('1e15'), 'Q'],
    [new BigNumber('1e12'), 'T'],
    [new BigNumber('1e9'), 'B'],
    [new BigNumber('1e6'), 'M'],
  ]
  for (const [threshold, suffix] of abbreviations) {
    if (value.isGreaterThanOrEqualTo(threshold)) {
      return value.dividedBy(threshold).toFixed(2, BigNumber.ROUND_DOWN) + suffix
    }
  }

  // Thousands: whole units, grouped. Exact even past 2^53.
  if (value.isGreaterThanOrEqualTo(1000)) {
    return value.integerValue(BigNumber.ROUND_DOWN).toFormat()
  }

  if (usd) {
    if (value.isLessThan(1)) {
      return value.precision(4, BigNumber.ROUND_DOWN).toFixed()
    }
    return value.toFixed(2, BigNumber.ROUND_DOWN)
  }

  if (pct && value.isGreaterThan(1)) {
    return value.toFixed(2, BigNumber.ROUND_DOWN)
  }

  // Below 1000, widen the window as the value shrinks so a small number still
  // shows significant digits rather than a row of zeros. Same ladder the
  // float version used — this is a precision fix, not a redesign, and the
  // displayed shape should not move.
  if (value.isZero()) return '0'
  const exponent = value.e ?? 0
  const leadingZeros = exponent < 0 ? -exponent - 1 : 0
  const places = leadingZeros < 4 ? 4 : leadingZeros < 6 ? 6 : 8
  return value.toFixed(places, BigNumber.ROUND_DOWN).replace(/\.?0+$/, '') || '0'
}
