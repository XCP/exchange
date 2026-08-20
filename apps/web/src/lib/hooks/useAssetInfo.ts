import useSWR from 'swr'
import { counterpartyUrl, fetcher } from '@/lib/api/client'

/** Asset facts that transaction forms must know before converting to base units. */
export interface AssetInfo {
  asset: string
  asset_longname: string | null
  description: string
  issuer: string | null
  owner: string | null
  divisible: boolean
  locked: boolean
  /** Above 2^53 this arrives as a string — see lib/api/lossless-json. */
  supply: number | string
  supply_normalized: string
  first_issuance_block_index: number | null
  first_issuance_block_time: number | null
}

interface CounterpartyAssetResponse {
  result?: AssetInfo
  error?: string
}

/**
 * Load an asset independently of any market, pool, order, or dispenser.
 *
 * Divisibility is a property of the asset itself. Tying it to a pair lookup
 * makes the forms that CREATE a first market impossible to use: the pair quite
 * correctly returns 404, even though the asset exists and its metadata loaded.
 */
export function useAssetInfo(asset: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<CounterpartyAssetResponse>(
    asset ? counterpartyUrl(`/assets/${encodeURIComponent(asset)}?verbose=true`) : null,
    fetcher,
  )

  return {
    info: data?.result ?? null,
    error,
    notFound: data != null && !data.result,
    isLoading,
    mutate,
  }
}
