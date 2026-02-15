import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface MarketEntry {
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  last_trade_time: number | null
  last_side: string | null
  price_change_24h: number | null
  volume_24h: number | null
  trade_count_24h: number | null
  open_orders: number
  bid_count: number
  ask_count: number
  best_bid: number | null
  best_ask: number | null
  spread: number | null
}

interface MarketsResponse {
  markets: MarketEntry[]
}

export function useMarkets(quote?: string, limit: number = 50) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (quote) params.set('quote', quote)

  const { data, error, isLoading } = useSWR<MarketsResponse>(
    dexUrl(`/markets?${params.toString()}`),
    fetcher,
    { refreshInterval: 60_000 }
  )

  return {
    markets: data?.markets ?? [],
    error,
    isLoading,
  }
}
