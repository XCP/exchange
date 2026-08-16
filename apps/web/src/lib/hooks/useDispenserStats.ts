import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface DispenserStats {
  asset: string
  last_dispense_price: number | null
  last_dispense_time: number | null
  price_change_24h: number | null
  price_change_1y: number | null
  price_change_30d: number | null
  volume_24h: number | null
  volume_1y: number | null
  volume_30d: number | null
  high_24h: number | null
  low_24h: number | null
  high_1y: number | null
  low_1y: number | null
  high_30d: number | null
  low_30d: number | null
  dispense_count_24h: number | null
  dispense_count_1y: number | null
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
  const { data, error, isLoading } = useDexSWR<DispenserStats>(
    asset ? dexUrl(`/dispenser-stats/${asset}`) : null
  )

  return { data, error, isLoading }
}

export interface DispenserMarket {
  asset: string
  asset_longname: string | null
  last_dispense_price: number | null
  cheapest_price: number | null
  active_dispensers: number
  volume_24h: number | null
}

/**
 * Assets with dispensers, busiest first.
 *
 * The browse list behind the dispense asset picker. It used to come from
 * `useMarkets({ quote: 'BTC' })`, which is the DEX's BTC-quoted ORDER BOOK —
 * a market that barely exists, so the picker opened saying "no active
 * markets" on a page listing hundreds of live dispensers. Dispensers are a
 * separate venue and have their own table.
 */
export function useDispenserMarkets(limit = 12) {
  const { data, error, isLoading } = useDexSWR<{ dispenser_markets: DispenserMarket[] }>(
    dexUrl(`/dispenser-stats?limit=${limit}&sort=volume_24h&order=desc`)
  )
  return { markets: data?.dispenser_markets ?? [], error, isLoading }
}
