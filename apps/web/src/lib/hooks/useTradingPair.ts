import useSWR from 'swr'
import { fetcher, dexUrl, counterpartyUrl } from '@/lib/api/client'
import type { CounterpartyResponse } from '@/types/api'
import type { PairStats } from './usePairStats'

interface CounterpartyAssetInfo {
  asset: string
  asset_longname: string | null
  description: string
  issuer: string | null
  divisible: boolean
  locked: boolean
  supply: number
  supply_normalized: string
  owner: string | null
  first_issuance_block_index: number | null
  first_issuance_block_time: number | null
}

interface CounterpartyAssetResponse {
  result: CounterpartyAssetInfo
}

export interface TradingPairData {
  // From DEX API /pair
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
  total_volume: number | null
  total_trade_count: number | null
  unique_traders: number | null
  all_time_high: number | null
  all_time_low: number | null
  // From CP API /assets
  asset_info: CounterpartyAssetInfo | null
  holders_count: number | null
}

export function useTradingPair(pairSlug: string) {
  const baseSymbol = pairSlug.substring(0, pairSlug.lastIndexOf('_'))

  const { data: pairStats, error: pairError, isLoading: pairLoading } = useSWR<PairStats>(
    pairSlug ? dexUrl(`/pair/${pairSlug}`) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  const { data: assetData, error: assetError, isLoading: assetLoading } = useSWR<CounterpartyAssetResponse>(
    baseSymbol ? counterpartyUrl(`/assets/${baseSymbol}?verbose=true`) : null,
    fetcher,
  )

  const { data: holdersData, error: holdersError } = useSWR<CounterpartyResponse<unknown[]>>(
    baseSymbol ? counterpartyUrl(`/assets/${baseSymbol}/balances?limit=1`) : null,
    fetcher,
  )

  const data: TradingPairData | undefined = pairStats ? {
    ...pairStats,
    asset_info: assetData?.result ?? null,
    holders_count: holdersData?.result_count ?? null,
  } : undefined

  return {
    data,
    error: pairError || assetError || holdersError,
    isLoading: pairLoading || assetLoading,
  }
}
