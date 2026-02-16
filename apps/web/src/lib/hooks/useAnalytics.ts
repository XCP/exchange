import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface TradeSummary {
  total_volume: number
  total_trade_count: number
  total_pairs: number
  active_pairs_24h: number
  volume_24h: number
  trades_24h: number
  open_orders: number
}

export interface DispenseSummary {
  total_btc_spent: number
  total_dispense_count: number
  open_dispensers: number
  dispense_vol_24h: number
  dispenses_24h: number
}

export interface DailyTradeVolume {
  timestamp: number
  volume: number
  trades: number
}

export interface DailyDispenseVolume {
  timestamp: number
  volume: number
  dispenses: number
}

export interface AnalyticsTopPair {
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  volume_24h: number
  trade_count_24h: number
  price_change_24h: number
}

export interface AnalyticsTopDispenser {
  asset: string
  asset_longname: string | null
  volume_24h: number
  dispense_count_24h: number
  last_dispense_price: number | null
  price_change_24h: number
  active_dispensers: number
}

export interface AnalyticsTrending {
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  last_trade_time: number | null
  price_change_24h: number
  volume_24h: number
  trade_count_24h: number
}

interface AnalyticsResponse {
  trade_summary: TradeSummary
  dispense_summary: DispenseSummary
  daily_trade_volume: DailyTradeVolume[]
  daily_dispense_volume: DailyDispenseVolume[]
  top_pairs: AnalyticsTopPair[]
  top_dispensers: AnalyticsTopDispenser[]
  trending: AnalyticsTrending[]
}

export function useAnalytics() {
  const { data, error, isLoading } = useSWR<AnalyticsResponse>(
    dexUrl('/analytics'),
    fetcher,
    { refreshInterval: 300_000 }
  )

  return {
    tradeSummary: data?.trade_summary ?? null,
    dispenseSummary: data?.dispense_summary ?? null,
    dailyTradeVolume: data?.daily_trade_volume ?? [],
    dailyDispenseVolume: data?.daily_dispense_volume ?? [],
    topPairs: data?.top_pairs ?? [],
    topDispensers: data?.top_dispensers ?? [],
    trending: data?.trending ?? [],
    error,
    isLoading,
  }
}
