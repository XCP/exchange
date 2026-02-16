import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface DispenserMarketEntry {
  asset: string
  asset_longname: string | null
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
  active_dispensers: number
  total_available: number | null
  cheapest_price: number | null
  first_dispense_time: number | null
  avg_price: number | null
  updated_at: string | null
  total_btc_spent: number | null
  total_dispensed: number | null
  total_dispense_count: number | null
  unique_buyers: number | null
  unique_sellers: number | null
  total_dispensers_created: number | null
  avg_dispense_btc: number | null
}

interface DispenserMarketsSummary {
  total_dispensers: number
  total_dispenses: number
  total_btc_volume: number
  unique_buyers: number
}

interface DispenserMarketsResponse {
  dispenser_markets: DispenserMarketEntry[]
  total: number
  limit: number
  offset: number
  summary: DispenserMarketsSummary
}

const PAGE_SIZE = 50

export function useDispenserMarkets(sort: string = 'total_btc_spent', includeHidden: boolean = false, timeframe: string = '24h', order: 'asc' | 'desc' = 'desc', page: number = 1) {
  const offset = (page - 1) * PAGE_SIZE
  const params = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: String(offset), timeframe, order })
  if (includeHidden) params.set('include_hidden', '1')
  const { data, error, isLoading } = useSWR<DispenserMarketsResponse>(
    dexUrl(`/dispenser-stats?${params}`),
    fetcher,
    { refreshInterval: 60_000 }
  )

  const total = data?.total ?? 0

  return {
    markets: data?.dispenser_markets ?? [],
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    summary: data?.summary ?? null,
    error,
    isLoading,
  }
}
