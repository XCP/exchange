import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { tradingPairUrl } from '@/lib/api/xcp'
import type { TradingPairDetail } from '@/types/trading'

export function useTradingPair(pairSlug: string) {
  const { data, error, isLoading } = useSWR<TradingPairDetail>(
    pairSlug ? tradingPairUrl(pairSlug) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  return { data, error, isLoading }
}
