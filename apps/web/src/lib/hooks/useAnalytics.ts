import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export type Timeframe = '24h' | '7d' | '30d' | 'all'

export interface TradeSummary {
  total_volume: number
  total_trade_count: number
  total_pairs: number
  active_pairs: number
  tf_volume: number
  tf_trades: number
  open_orders: number
}

export interface DispenseSummary {
  total_btc_spent: number
  total_dispense_count: number
  open_dispensers: number
  tf_volume: number
  tf_dispenses: number
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
  volume: number
  trade_count: number
  price_change: number
}

export interface AnalyticsTopDispenser {
  asset: string
  asset_longname: string | null
  volume: number
  dispense_count: number
  last_dispense_price: number | null
  price_change: number
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
  timeframe: string
  trade_summary: TradeSummary
  dispense_summary: DispenseSummary
  daily_trade_volume: DailyTradeVolume[]
  daily_dispense_volume: DailyDispenseVolume[]
  top_pairs: AnalyticsTopPair[]
  top_dispensers: AnalyticsTopDispenser[]
  trending: AnalyticsTrending[]
}

export function useAnalytics(timeframe: Timeframe = '24h', includeHidden: boolean = false) {
  const params = new URLSearchParams()
  params.set('timeframe', timeframe)
  if (includeHidden) params.set('include_hidden', '1')

  const { data, error, isLoading } = useSWR<AnalyticsResponse>(
    dexUrl(`/analytics?${params}`),
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
