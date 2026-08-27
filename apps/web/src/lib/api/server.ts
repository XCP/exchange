import type { PairStats } from '@/lib/hooks/usePairStats'
import type { DispenserStats } from '@/lib/hooks/useDispenserStats'

/**
 * Deadline for server-side fetches.
 *
 * These run inside the Worker while rendering a page, so a third party that
 * stalls does not just delay a widget -- it holds the request open, burns wall
 * time against the invocation, and delays the HTML for everyone hitting that
 * route until the ISR entry is written. Every one of these already returns
 * null on failure; without a signal none of them ever reaches that branch when
 * the failure is a stall rather than an error.
 */
const SSR_FETCH_TIMEOUT_MS = 8_000

const DEX_API_BASE = process.env.NEXT_PUBLIC_DEX_API_BASE ?? 'https://api.xcpdex.com'
const COUNTERPARTY_API_BASE = process.env.NEXT_PUBLIC_COUNTERPARTY_API_BASE ?? 'https://api.counterparty.io:4000/v2'

export async function fetchPairStats(pairSlug: string): Promise<PairStats | null> {
  try {
    const res = await fetch(`${DEX_API_BASE}/pair/${pairSlug}`, {
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export interface PoolMetaResult {
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  reserve_a: number
  reserve_b: number
  match_count: number
}

/** One pool, for generateMetadata. Null on any failure — metadata must never 500 a page. */
export async function fetchPool(lpAsset: string): Promise<PoolMetaResult | null> {
  try {
    const res = await fetch(`${DEX_API_BASE}/pools/${lpAsset}`, { signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS), next: { revalidate: 300 } })
    if (!res.ok) return null
    const body = await res.json()
    return (body?.pool ?? body) as PoolMetaResult
  } catch {
    return null
  }
}

export interface CoinPrices {
  xcp: number | null
  btc: number | null
  supply: number | null
}

/**
 * Today's XCP and BTC in dollars, for the /price share card.
 *
 * The same upstream calendar /api/usd-anchors proxies, read directly here
 * because generateMetadata runs on the server and has no reason to hop through
 * our own route to reach it.
 */
export async function fetchCoinPrices(): Promise<CoinPrices | null> {
  try {
    /**
     * `no-store`, NOT `next: { revalidate: 900 }`, and the difference is three
     * days of wrong numbers.
     *
     * The revalidate hint puts this response in Next's data cache, which
     * OpenNext backs with the R2 incremental bucket — the same store whose
     * staleness is documented in open-next.config.ts. It does not reliably
     * revalidate here. Measured 2026-08-25: the page itself was rendering
     * dynamically (`no-store` on the response) and STILL served XCP at $1.78
     * and BTC at $77,477 while the upstream said $2.4182 and $80,606.78 —
     * both frozen together at the 08-22 deploy, because one stale cache entry
     * backs the whole call.
     *
     * A page-level `revalidate` export would not have fixed it; the page was
     * already re-rendering per request and re-reading the same stale entry.
     *
     * The upstream is a Worker behind Cloudflare's own edge cache, so going
     * uncached here costs an edge hit, not a cold origin round trip.
     */
    const [res, tickerRes] = await Promise.all([
      fetch('https://api.xcp.io/v2/price', {
        signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
        cache: 'no-store',
      }),
      fetch('https://api.xcp.io/v2/price/ticker', {
        signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
        cache: 'no-store',
      }),
    ])
    if (!res.ok) return null
    const r = (await res.json())?.result
    const ticker = tickerRes.ok ? (await tickerRes.json())?.result : null
    const last = r?.history?.[r.history.length - 1]
    return {
      xcp: ticker?.xcp?.usd ?? r?.xcp?.usd ?? null,
      btc: r?.btc?.usd ?? null,
      supply: last?.supply ?? null,
    }
  } catch {
    return null
  }
}

export async function fetchDispenserStats(asset: string): Promise<DispenserStats | null> {
  try {
    const res = await fetch(`${DEX_API_BASE}/dispenser-stats/${asset}`, {
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export interface AssetInfoResult {
  asset: string
  asset_longname: string | null
  description: string
  issuer: string | null
  divisible: boolean
  locked: boolean
  supply: number
  supply_normalized: string
  owner: string | null
}

/**
 * Does this asset exist at all?
 *
 * Deliberately three-valued. `fetchAssetInfo` collapses "Counterparty says
 * Not found" and "Counterparty did not answer" into the same null, which is
 * fine for metadata — a missing fact degrades to a generic card — and wrong
 * for a 404, where the second case would take a real asset off the site for
 * as long as the response stayed cached.
 */
export async function assetExists(asset: string): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const res = await fetch(`${COUNTERPARTY_API_BASE}/assets/${asset}?verbose=true`, {
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    })
    if (res.status === 404) return 'no'
    if (!res.ok) return 'unknown'
    const data = await res.json()
    if (data?.result?.asset) return 'yes'
    // The node answers 200 with {"error": "Not found"} for a name nobody has
    // ever issued, so the status code alone does not settle it.
    return data?.error ? 'no' : 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function fetchAssetInfo(asset: string): Promise<AssetInfoResult | null> {
  try {
    const res = await fetch(`${COUNTERPARTY_API_BASE}/assets/${asset}?verbose=true`, {
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.result ?? null
  } catch {
    return null
  }
}
