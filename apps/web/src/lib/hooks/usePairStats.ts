import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface PairStats {
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  last_trade_time: number | null
  last_side: string | null
  price_change_24h: number | null
  price_change_7d: number | null
  price_change_30d: number | null
  volume_24h: number | null
  volume_7d: number | null
  volume_30d: number | null
  high_24h: number | null
  low_24h: number | null
  high_7d: number | null
  low_7d: number | null
  high_30d: number | null
  low_30d: number | null
  trade_count_24h: number | null
  trade_count_7d: number | null
  trade_count_30d: number | null
  first_trade_time: number | null
  open_orders: number | null
  bid_count: number | null
  ask_count: number | null
  best_bid: number | null
  best_ask: number | null
  spread: number | null
  updated_at: number | null
  total_volume: number | null
  total_base_volume: number | null
  base_volume_24h: number | null
  base_volume_7d: number | null
  base_volume_30d: number | null
  total_trade_count: number | null
  unique_traders: number | null
  all_time_high: number | null
  all_time_low: number | null
}

export function usePairStats(pairSlug: string) {
  const { data, error, isLoading } = useSWR<PairStats>(
    pairSlug ? dexUrl(`/pair/${pairSlug}`) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  return { data, error, isLoading }
}
