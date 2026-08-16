/**
 * JSON parsing that does not silently round large integers.
 *
 * A Counterparty quantity is an unsigned 64-bit integer. `JSON.parse` has no
 * big-integer mode: a JSON integer above 2^53-1 is approximated to the
 * nearest double *during parsing*, before any application code runs. No
 * amount of BigNumber discipline downstream can recover those digits, because
 * they are gone before utils/numeric ever sees the value.
 *
 * This is not hypothetical. Measured against mainnet while writing this:
 *
 *   PEPECASH supply on the wire   99526914711111111
 *   after JSON.parse              99526914711111100
 *
 * Any divisible asset above roughly 90 million units is past the line, which
 * is most of the ones worth trading.
 *
 * The `*_normalized` string fields the API also emits are a partial
 * mitigation only: they survive parsing, but core computes them in Python
 * floats and they can themselves be off in the last place — and endpoints
 * like the pool quote do not emit them at all.
 *
 * Integers outside the safe range are therefore handed back as **strings**,
 * preserving every digit. Everything in utils/numeric accepts strings
 * and is exact with them. Values inside the safe range are left as numbers,
 * so nothing that was already correct changes shape.
 *
 * Ported from the wallet extension's core/api/losslessJson.
 */

/**
 * Rewrite unsafe integer literals as quoted strings.
 *
 * Walks the text rather than pattern-matching it: digits inside string
 * literals must not be touched, and a regex over the whole document would
 * happily rewrite an asset description that contains a long number. In JSON,
 * keys are always strings, so any digit encountered outside a string literal
 * is the start of a numeric value.
 */
export function quoteUnsafeIntegers(text: string): string {
  let out = ''
  let i = 0

  while (i < text.length) {
    const char = text[i]!

    if (char === '"') {
      const start = i
      i += 1
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2
          continue
        }
        if (text[i] === '"') {
          i += 1
          break
        }
        i += 1
      }
      out += text.slice(start, i)
      continue
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      const start = i
      if (text[i] === '-') i += 1
      while (i < text.length && text[i]! >= '0' && text[i]! <= '9') i += 1

      // A fraction or exponent means the value was never an exact integer to
      // begin with, so quoting it would change its meaning rather than
      // preserve it.
      let isInteger = true
      if (i < text.length && (text[i] === '.' || text[i] === 'e' || text[i] === 'E')) {
        isInteger = false
        while (i < text.length && /[0-9eE+\-.]/.test(text[i]!)) i += 1
      }

      const literal = text.slice(start, i)
      out += isInteger && !Number.isSafeInteger(Number(literal)) ? `"${literal}"` : literal
      continue
    }

    out += char
    i += 1
  }

  return out
}

/**
 * `JSON.parse`, but integers too large for a double survive as strings
 * instead of being rounded.
 *
 * Throws the same way `JSON.parse` does on malformed input, so callers need
 * no new error handling.
 */
export function parseJsonLossless<T = unknown>(text: string): T {
  return JSON.parse(quoteUnsafeIntegers(text)) as T
}
