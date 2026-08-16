import { COUNTERPARTY_API_BASE, DEX_API_BASE } from '@/utils/constants'
import { parseJsonLossless } from '@/lib/api/lossless-json'

/**
 * Every API read goes through here, which is the only place a quantity can
 * be saved from `JSON.parse`.
 *
 * Counterparty quantities are 64-bit integers and routinely exceed 2^53 —
 * PEPECASH's supply loses its last two digits to a plain `res.json()`. The
 * rounding happens inside the parser, so it cannot be undone afterwards; it
 * has to be prevented here. See lib/api/lossless-json.
 *
 * The cost is that an integer above 2^53 arrives as a STRING rather than a
 * number. Anything doing arithmetic on such a field should go through
 * utils/numeric, which is exact with strings.
 */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return parseJsonLossless<T>(await res.text())
}

// api.counterparty.io URL builders
export function counterpartyUrl(path: string): string {
  return `${COUNTERPARTY_API_BASE}${path}`
}

// api.xcpdex.com URL builders
export function dexUrl(path: string): string {
  return `${DEX_API_BASE}${path}`
}
