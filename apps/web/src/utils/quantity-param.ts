/**
 * Exact decimal digits for a compose query parameter — the last gate before
 * signing.
 *
 * Every quantity a user signs is serialized through here. String() on an
 * unsafe double prints wrong digits or exponent notation ("1e+21"), and
 * Counterparty would happily compose a transaction around either — so an
 * unusable value throws with a message the caller can show, rather than
 * silently becoming a different amount than the one on screen.
 *
 * Strings and bigints pass through untouched: both already carry exact digits.
 */
export function quantityParam(value: string | number | bigint): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) {
    throw new Error(`Refusing to compose a non-finite quantity (${value}).`)
  }
  if (!Number.isInteger(value)) {
    throw new Error(`Refusing to compose a fractional quantity (${value}).`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `Quantity ${value} is past the exact range of a JavaScript number. ` +
        `Pass it as a string or bigint.`,
    )
  }
  return value.toString()
}
