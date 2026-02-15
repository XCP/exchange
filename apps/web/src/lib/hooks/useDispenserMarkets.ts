import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface DispenserMarketEntry {
  asset: string
  last_dispense_price: number | null
  last_dispense_time: number | null
  price_change_24h: number | null
  volume_24h: number | null
  volume_7d: number | null
  dispense_count_24h: number | null
  dispense_count_7d: number | null
  active_dispensers: number
  total_available: number | null
  cheapest_price: number | null
  high_24h: number | null
  low_24h: number | null
  avg_price: number | null
  updated_at: string | null
}

interface DispenserMarketsResponse {
  dispenser_markets: DispenserMarketEntry[]
  total: number
  limit: number
  offset: number
}

export function useDispenserMarkets(sort: string = 'volume_24h') {
  const { data, error, isLoading } = useSWR<DispenserMarketsResponse>(
    dexUrl(`/dispenser-stats?sort=${sort}&limit=50`),
    fetcher,
    { refreshInterval: 60_000 }
  )

  return {
    markets: data?.dispenser_markets ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}
