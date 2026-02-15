import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { tradingPairsUrl } from '@/lib/api/xcp'
import type { TradingPairSummary } from '@/types/trading'

interface TradingPairsResponse {
  result: TradingPairSummary[]
}

export function useTradingPairs(market: string = 'XCP') {
  const { data, error, isLoading } = useSWR<TradingPairsResponse>(
    tradingPairsUrl(market),
    fetcher,
    { refreshInterval: 60_000 }
  )

  return {
    pairs: data?.result ?? [],
    error,
    isLoading,
  }
}
