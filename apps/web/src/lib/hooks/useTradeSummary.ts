import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface TradeSummary {
  total_pairs: number
  active_pairs_24h: number
  volume_24h: number
  trades_24h: number
  total_trades: number
}

export function useTradeSummary(includeHidden: boolean = false) {
  const params = includeHidden ? '?include_hidden=1' : ''
  const { data, error, isLoading } = useDexSWR<TradeSummary>(
    dexUrl(`/trade-summary${params}`)
  )

  return { data, error, isLoading }
}
