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
