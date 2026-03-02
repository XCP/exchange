import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export type Timeframe = '24h' | '7d' | '30d' | 'all'

export interface TradeSummary {
  total_volume: number
  total_trade_count: number
  total_pairs: number
  active_pairs: number
  tf_volume: number
  tf_trades: number
  open_orders: number
  tf_orders: number
  tf_unique_traders: number
  new_pairs: number
}

export interface DispenseSummary {
  total_btc_spent: number
  total_dispense_count: number
  open_dispensers: number
  tf_volume: number
  tf_dispenses: number
  active_assets: number
  total_assets: number
  tf_dispensers_created: number
  tf_unique_buyers: number
  new_assets: number
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
  base_asset_longname: string | null
  last_price: number | null
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

export interface QuoteVolume {
  quote_asset: string
  volume: number
  trade_count: number
}

export interface AnalyticsTopTrader {
  address: string
  volume: number
  trades: number
}

interface AnalyticsResponse {
  timeframe: string
  trade_summary: TradeSummary
  dispense_summary: DispenseSummary
  daily_trade_volume: DailyTradeVolume[]
  daily_dispense_volume: DailyDispenseVolume[]
  daily_btc_trade_volume: DailyTradeVolume[]
  top_pairs: AnalyticsTopPair[]
  top_dispensers: AnalyticsTopDispenser[]
  quote_volumes: QuoteVolume[]
  top_makers: AnalyticsTopTrader[]
  top_takers: AnalyticsTopTrader[]
  top_btc_buyers: AnalyticsTopTrader[]
  top_btc_sellers: AnalyticsTopTrader[]
}

function buildParams(timeframe: Timeframe, includeHidden: boolean, section: string) {
  const params = new URLSearchParams()
  params.set('timeframe', timeframe)
  params.set('section', section)
  if (includeHidden) params.set('include_hidden', '1')
  return params.toString()
}

export function useAnalytics(timeframe: Timeframe = '24h', includeHidden: boolean = false) {
  // Three parallel requests to stay within D1 resource limits
  const summaryKey = dexUrl(`/analytics?${buildParams(timeframe, includeHidden, 'summary')}`)
  const chartsKey = dexUrl(`/analytics?${buildParams(timeframe, includeHidden, 'charts')}`)
  const tradersKey = dexUrl(`/analytics?${buildParams(timeframe, includeHidden, 'traders')}`)

  const summary = useDexSWR<AnalyticsResponse>(summaryKey)
  const charts = useDexSWR<AnalyticsResponse>(chartsKey)
  const traders = useDexSWR<AnalyticsResponse>(tradersKey)

  return {
    tradeSummary: summary.data?.trade_summary ?? null,
    dispenseSummary: summary.data?.dispense_summary ?? null,
    topPairs: summary.data?.top_pairs ?? [],
    topDispensers: summary.data?.top_dispensers ?? [],
    quoteVolumes: summary.data?.quote_volumes ?? [],
    dailyTradeVolume: charts.data?.daily_trade_volume ?? [],
    dailyDispenseVolume: charts.data?.daily_dispense_volume ?? [],
    dailyBtcTradeVolume: charts.data?.daily_btc_trade_volume ?? [],
    topMakers: traders.data?.top_makers ?? [],
    topTakers: traders.data?.top_takers ?? [],
    topBtcBuyers: traders.data?.top_btc_buyers ?? [],
    topBtcSellers: traders.data?.top_btc_sellers ?? [],
    error: summary.error || charts.error || traders.error,
    isLoading: summary.isLoading || charts.isLoading || traders.isLoading,
    summaryLoading: summary.isLoading,
    chartsLoading: charts.isLoading,
    tradersLoading: traders.isLoading,
  }
}
