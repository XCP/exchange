import { COUNTERPARTY_API_BASE, DEX_API_BASE } from '@/utils/constants'
import { parseJsonLossless } from '@/lib/api/lossless-json'
import { relayingFetch } from '@/lib/counterparty-relay'

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
/**
 * Deadline for every SWR read in the app.
 *
 * This fetcher is shared by use-dex-swr (all of api.xcpdex.com) and by
 * useBtcBalance (mempool.space), and had no deadline on either. A fetch with
 * no signal waits on the browser default, minutes away, so a host that stalls
 * rather than fails leaves the component spinning with no error for SWR to
 * retry from or for an error branch to render.
 *
 * 10s is well clear of the real numbers -- the slowest measured api.xcpdex.com
 * response was 897ms before the orders index, and 93ms after -- so this only
 * fires when something is genuinely wrong, and turns it into a normal SWR
 * error that retries on the next interval.
 */
const FETCH_TIMEOUT_MS = 10_000

export async function fetcher<T>(url: string): Promise<T> {
  // relayingFetch is a no-op for anything that is not Counterparty, so
  // api.xcpdex.com and mempool.space read exactly as they always have.
  const res = await relayingFetch(url, FETCH_TIMEOUT_MS)
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
