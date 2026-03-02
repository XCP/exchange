import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import type { PairStats } from './usePairStats'

interface PairMarketsResponse {
  pairs: PairStats[]
  total: number
  limit: number
  offset: number
}

const PAGE_SIZE = 50

export function usePairMarkets(sort: string = 'total_trade_count', includeHidden: boolean = false, timeframe: string = '24h', order: 'asc' | 'desc' = 'desc', page: number = 1) {
  const offset = (page - 1) * PAGE_SIZE
  const params = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: String(offset), timeframe, order })
  if (includeHidden) params.set('include_hidden', '1')
  const { data, error, isLoading } = useDexSWR<PairMarketsResponse>(
    dexUrl(`/pairs?${params}`)
  )

  const total = data?.total ?? 0

  return {
    pairs: data?.pairs ?? [],
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    error,
    isLoading,
  }
}
