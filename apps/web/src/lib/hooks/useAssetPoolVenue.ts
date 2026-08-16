import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface PoolVenue {
  lp_asset: string
  pair: string
  /** The other side of the pool — what this asset would be swapped against. */
  counter_asset: string
  /** Reserves oriented to the asset asked about, not to the pool's a/b order. */
  asset_reserve: number
  counter_reserve: number
  match_count: number
}

interface PoolVenueResponse {
  asset: string
  has_pool: boolean
  preferred: PoolVenue | null
  pools: PoolVenue[]
}

/**
 * Which pool, if any, an asset can be swapped through.
 *
 * `preferred` is ordered server-side — XCP, then PEPECASH, then the deepest
 * remaining pool in the asset's own reserve — so this hook must not re-sort.
 * Two surfaces depend on the same answer (the asset page's swap tab and /swap
 * itself) and they have to agree.
 *
 * `isLoading` matters here: the swap tab is hidden when there is no pool, so
 * rendering the tabs before the answer arrives would make the control flicker
 * in and out. Callers should hold the tab list until loading settles.
 */
export function useAssetPoolVenue(asset: string | null | undefined) {
  const { data, error, isLoading } = useDexSWR<PoolVenueResponse>(
    asset ? dexUrl(`/assets/${encodeURIComponent(asset)}/pool-venue`) : null
  )

  return {
    hasPool: data?.has_pool ?? false,
    preferred: data?.preferred ?? null,
    pools: data?.pools ?? [],
    isLoading,
    error,
  }
}
