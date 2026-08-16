import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface SearchPairResult {
  pair: string
  base_asset: string
  quote_asset: string
  base_asset_longname: string | null
  last_price: number | null
  volume_24h: number | null
  trade_count_24h: number | null
}

export interface SearchDispenserResult {
  asset: string
  asset_longname: string | null
  last_dispense_price: number | null
  cheapest_price: number | null
  volume_24h: number | null
  active_dispensers: number
}

export interface SearchPoolResult {
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  reserve_a: number
  reserve_b: number
  match_count: number
}

export interface SearchAssetResult {
  asset: string
  asset_longname: string | null
  supply_normalized: number | string | null
  locked: number
  first_issuance_block_time: number | null
}

export interface SearchResponse {
  pairs: SearchPairResult[]
  dispensers: SearchDispenserResult[]
  pools: SearchPoolResult[]
  assets: SearchAssetResult[]
}

const EMPTY: SearchResponse = { pairs: [], dispensers: [], pools: [], assets: [] }

/**
 * @param category When a tab is chosen, the server returns a page's worth of
 * that one instead of the six-per-category slice the mixed view shows. The
 * chips used to filter rows already fetched, so picking Markets could only
 * ever narrow six results — never reveal a seventh.
 */
export function useSearch(query: string, category?: string) {
  const params = new URLSearchParams({ q: query })
  if (category && category !== 'all') params.set('category', category)
  const { data, isLoading } = useDexSWR<SearchResponse>(
    query.length >= 2 ? dexUrl(`/search?${params.toString()}`) : null,
    { dedupingInterval: 300, keepPreviousData: true },
  )

  // Older deployments answer without pools/assets; default them so callers
  // never have to guard each list.
  return { data: data ? { ...EMPTY, ...data } : undefined, isLoading }
}
