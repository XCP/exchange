import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface DispenserStats {
  asset: string
  last_dispense_price: number | null
  last_dispense_time: number | null
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
  dispense_count_24h: number | null
  dispense_count_7d: number | null
  dispense_count_30d: number | null
  active_dispensers: number | null
  total_available: number | null
  cheapest_price: number | null
  first_dispense_time: number | null
  total_btc_spent: number | null
  total_dispensed: number | null
  total_dispense_count: number | null
  unique_buyers: number | null
  unique_sellers: number | null
  total_dispensers_created: number | null
  avg_dispense_btc: number | null
}

export function useDispenserStats(asset: string) {
  const { data, error, isLoading } = useSWR<DispenserStats>(
    asset ? dexUrl(`/dispenser-stats/${asset}`) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  return { data, error, isLoading }
}
