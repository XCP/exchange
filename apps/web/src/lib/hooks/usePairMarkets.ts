import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'
import type { PairStats } from './usePairStats'

interface PairMarketsResponse {
  pairs: PairStats[]
  total: number
  limit: number
  offset: number
}

export function usePairMarkets(sort: string = 'total_trade_count', includeHidden: boolean = false, timeframe: string = '24h', order: 'asc' | 'desc' = 'desc') {
  const params = new URLSearchParams({ sort, limit: '50', timeframe, order })
  if (includeHidden) params.set('include_hidden', '1')
  const { data, error, isLoading } = useSWR<PairMarketsResponse>(
    dexUrl(`/pairs?${params}`),
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
