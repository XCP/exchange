/** Convert a number to decimal string without scientific notation. */
function toPlainDecimal(n: number): string {
  if (!isFinite(n)) return String(n)
  return n.toFixed(20).replace(/\.?0+$/, '')
}

/**
 * Fix scientific notation in a JSON string by parsing and re-serializing.
 *
 * The previous regex approach was unsafe — it matched hex-like substrings
 * inside quoted strings (e.g., UUID segment "4236e614" → "Infinity").
 *
 * This version uses a proper JSON reviver to only touch actual number values.
 */
export function fixScientificNotation(json: string): string {
  try {
    const parsed = JSON.parse(json, (_key, value) => {
      // Only transform actual number values (not strings containing digits)
      if (typeof value === 'number' && isFinite(value)) {
        const str = String(value)
        if (str.includes('e') || str.includes('E')) {
          // Return as a tagged placeholder that we'll replace in the output
          return `__SCI_FIX__${toPlainDecimal(value)}__`
        }
      }
      return value
    })
    // Re-serialize and unwrap the placeholders (they'll be quoted strings)
    return JSON.stringify(parsed).replace(/"__SCI_FIX__([^"]+)__"/g, '$1')
  } catch {
    // If parsing fails, return original
    return json
  }
}
