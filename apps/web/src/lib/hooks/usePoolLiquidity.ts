import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

/** One reading of a pool's reserves. See apps/api/src/routes/pool-liquidity.ts. */
export interface LiquidityPoint {
  t: number
  a: number
  b: number
}

interface LiquidityResponse {
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  interval: string
  points: LiquidityPoint[]
}

/**
 * A pool's reserves over time.
 *
 * Returns both sides rather than a total, because which asset is the quote
 * is a display decision. For a constant-product pool the two sides are equal
 * in value at the pool's own price, so total value locked is twice whichever
 * reserve the caller is denominating in.
 */
export function usePoolLiquidity(
  lpAsset: string | null,
  interval: string,
  limit: number,
) {
  const { data, error, isLoading } = useDexSWR<LiquidityResponse>(
    lpAsset
      ? dexUrl(`/pools/${encodeURIComponent(lpAsset)}/liquidity?interval=${interval}&limit=${limit}`)
      : null,
    { revalidateOnFocus: false },
  )

  return { points: data?.points ?? [], meta: data ?? null, error, isLoading }
}
