/** Convert a number to decimal string without scientific notation. */
function toPlainDecimal(n: number): string {
  return n.toFixed(20).replace(/\.?0+$/, '')
}

/**
 * Fix scientific notation in a JSON string.
 * JSON number literals only appear after : , or [ (never inside quoted strings),
 * so a lookbehind on those characters is safe.
 */
export function fixScientificNotation(json: string): string {
  return json.replace(
    /(?<=[:,\[])(-?\d+\.?\d*[eE][+-]?\d+)/g,
    (match) => toPlainDecimal(Number(match))
  )
}
