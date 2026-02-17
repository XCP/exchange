import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

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
  const { data, isLoading } = useSWR<SearchResponse>(
    query.length >= 2 ? dexUrl(`/search?q=${encodeURIComponent(query)}`) : null,
    fetcher,
    { dedupingInterval: 300, keepPreviousData: true }
  )

  return { data, isLoading }
}
