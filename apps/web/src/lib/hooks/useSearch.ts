import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface SearchPairResult {
  pair: string
  base_asset: string
  quote_asset: string
  base_asset_longname: string | null
  last_price: number | null
  volume_24h: number | null
}

export interface SearchDispenserResult {
  asset: string
  asset_longname: string | null
  last_dispense_price: number | null
  cheapest_price: number | null
  volume_24h: number | null
  active_dispensers: number
}

interface SearchResponse {
  pairs: SearchPairResult[]
  dispensers: SearchDispenserResult[]
}

export function useSearch(query: string) {
  const { data, isLoading } = useDexSWR<SearchResponse>(
    query.length >= 2 ? dexUrl(`/search?q=${encodeURIComponent(query)}`) : null,
    { dedupingInterval: 300, keepPreviousData: true }
  )

  return { data, isLoading }
}
