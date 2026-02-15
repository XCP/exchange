import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface PairEntry {
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  last_trade_time: number | null
  price_change_24h: number | null
  volume_24h: number | null
  trade_count_24h: number | null
}

interface PairsResponse {
  pairs: PairEntry[]
}

export function useAssetMarkets(asset: string) {
  const { data, error, isLoading } = useSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?base=${asset}&limit=50`) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  return {
    pairs: data?.pairs ?? [],
    error,
    isLoading,
  }
}
