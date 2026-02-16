import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'
import type { PairStats } from './usePairStats'

interface PairMarketsResponse {
  pairs: PairStats[]
  total: number
  limit: number
  offset: number
}

export function usePairMarkets(sort: string = 'total_trade_count') {
  const { data, error, isLoading } = useSWR<PairMarketsResponse>(
    dexUrl(`/pairs?sort=${sort}&limit=50`),
    fetcher,
    { refreshInterval: 60_000 }
  )

  return {
    pairs: data?.pairs ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}
