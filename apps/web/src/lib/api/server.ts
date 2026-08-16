import type { PairStats } from '@/lib/hooks/usePairStats'
import type { DispenserStats } from '@/lib/hooks/useDispenserStats'

const DEX_API_BASE = process.env.NEXT_PUBLIC_DEX_API_BASE ?? 'https://api.xcpdex.com'
const COUNTERPARTY_API_BASE = process.env.NEXT_PUBLIC_COUNTERPARTY_API_BASE ?? 'https://api.counterparty.io:4000/v2'

export async function fetchPairStats(pairSlug: string): Promise<PairStats | null> {
  try {
    const res = await fetch(`${DEX_API_BASE}/pair/${pairSlug}`, {
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
    const res = await fetch(`${DEX_API_BASE}/pools/${lpAsset}`, { next: { revalidate: 300 } })
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
    const res = await fetch('https://api.xcp.io/v2/price', { next: { revalidate: 900 } })
    if (!res.ok) return null
    const r = (await res.json())?.result
    const last = r?.history?.[r.history.length - 1]
    return {
      xcp: r?.xcp?.usd ?? null,
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
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.result ?? null
  } catch {
    return null
  }
}
