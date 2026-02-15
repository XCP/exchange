import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { globalOrderMatchesUrl } from '@/lib/api/counterparty'
import type { GlobalOrderMatch } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'

export function useGlobalTrades(limit: number = 50) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<GlobalOrderMatch[]>>(
    globalOrderMatchesUrl(limit),
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    trades: data?.result ?? [],
    error,
    isLoading,
  }
}
