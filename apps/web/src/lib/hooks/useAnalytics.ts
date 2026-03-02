import useSWR from 'swr'
import { dexUrl, fetcher } from '@/lib/api/client'

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
  volume: number
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
  quote_asset_longname: string | null
  volume: number
  trade_count: number
}

export interface AnalyticsTopTrader {
  address: string
  volume: number
  trades: number
}

export interface TopTradedCollection {
  slug: string
  name: string
  trade_count: number
  volume: number
  price_change: number
}

export interface TopDispensedCollection {
  slug: string
  name: string
  volume: number
  dispense_count: number
  price_change: number
}

// Per-section response types
interface SummaryResponse {
  timeframe: string
  trade_summary: TradeSummary
  dispense_summary: DispenseSummary
  top_pairs: AnalyticsTopPair[]
  top_dispensers: AnalyticsTopDispenser[]
  quote_volumes: QuoteVolume[]
  top_traded_collections: TopTradedCollection[]
  top_dispensed_collections: TopDispensedCollection[]
}

interface ChartsResponse {
  timeframe: string
  daily_trade_volume: DailyTradeVolume[]
  daily_dispense_volume: DailyDispenseVolume[]
  daily_btc_trade_volume: DailyTradeVolume[]
}

interface TradersResponse {
  timeframe: string
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

// Analytics data changes at most every 10-min cron tick — no need for block-level cache busting
const ANALYTICS_SWR_OPTS = {
  dedupingInterval: 5 * 60 * 1000,
  revalidateOnFocus: false,
}

export function useAnalyticsSummary(timeframe: Timeframe, includeHidden: boolean) {
  const key = dexUrl(`/analytics?${buildParams(timeframe, includeHidden, 'summary')}`)
  const { data, isLoading, error } = useSWR<SummaryResponse>(key, fetcher, ANALYTICS_SWR_OPTS)
  return {
    tradeSummary: data?.trade_summary ?? null,
    dispenseSummary: data?.dispense_summary ?? null,
    topPairs: data?.top_pairs ?? [],
    topDispensers: data?.top_dispensers ?? [],
    quoteVolumes: data?.quote_volumes ?? [],
    topTradedCollections: data?.top_traded_collections ?? [],
    topDispensedCollections: data?.top_dispensed_collections ?? [],
    isLoading,
    error,
  }
}

export function useAnalyticsCharts(timeframe: Timeframe, includeHidden: boolean, ready = true) {
  const key = ready ? dexUrl(`/analytics?${buildParams(timeframe, includeHidden, 'charts')}`) : null
  const { data, isLoading, error } = useSWR<ChartsResponse>(key, fetcher, ANALYTICS_SWR_OPTS)
  return {
    dailyTradeVolume: data?.daily_trade_volume ?? [],
    dailyDispenseVolume: data?.daily_dispense_volume ?? [],
    dailyBtcTradeVolume: data?.daily_btc_trade_volume ?? [],
    isLoading: ready ? isLoading : true,
    error,
  }
}

export function useAnalyticsTraders(timeframe: Timeframe, includeHidden: boolean, ready = true) {
  const key = ready ? dexUrl(`/analytics?${buildParams(timeframe, includeHidden, 'traders')}`) : null
  const { data, isLoading, error } = useSWR<TradersResponse>(key, fetcher, ANALYTICS_SWR_OPTS)
  return {
    topMakers: data?.top_makers ?? [],
    topTakers: data?.top_takers ?? [],
    topBtcBuyers: data?.top_btc_buyers ?? [],
    topBtcSellers: data?.top_btc_sellers ?? [],
    isLoading: ready ? isLoading : true,
    error,
  }
}
