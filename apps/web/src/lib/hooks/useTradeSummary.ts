import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface TradeSummary {
  total_pairs: number
  active_pairs_24h: number
  volume_24h: number
  trades_24h: number
  total_trades: number
}

export function useTradeSummary() {
  const { data, error, isLoading } = useSWR<TradeSummary>(
    dexUrl('/trade-summary'),
    fetcher,
    { refreshInterval: 60_000 }
  )

  return { data, error, isLoading }
}
