import useSWR from 'swr'
import { fetcher, dexUrl, counterpartyUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import { useAssetInfo, type AssetInfo } from '@/lib/hooks/useAssetInfo'
import type { CounterpartyResponse } from '@/types/api'
import type { PairStats } from './usePairStats'

export interface TradingPairData {
  // From DEX API /pair
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  last_trade_time: number | null
  last_side: string | null
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
  trade_count_24h: number | null
  trade_count_1y: number | null
  trade_count_30d: number | null
  first_trade_time: number | null
  total_volume: number | null
  total_base_volume: number | null
  base_volume_24h: number | null
  base_volume_1y: number | null
  base_volume_30d: number | null
  total_trade_count: number | null
  unique_traders: number | null
  all_time_high: number | null
  all_time_low: number | null
  // From CP API /assets
  asset_info: AssetInfo | null
  holders_count: number | null
}

export function useTradingPair(pairSlug: string) {
  const baseSymbol = pairSlug.substring(0, pairSlug.lastIndexOf('_'))

  const { data: pairStats, error: pairError, isLoading: pairLoading } = useDexSWR<PairStats>(
    pairSlug ? dexUrl(`/pair/${pairSlug}`) : null
  )

  const { info: assetInfo, error: assetError, isLoading: assetLoading } = useAssetInfo(baseSymbol || null)

  const { data: holdersData, error: holdersError } = useSWR<CounterpartyResponse<unknown[]>>(
    baseSymbol ? counterpartyUrl(`/assets/${baseSymbol}/balances?limit=1`) : null,
    fetcher,
  )

  const data: TradingPairData | undefined = pairStats ? {
    ...pairStats,
    asset_info: assetInfo,
    holders_count: holdersData?.result_count ?? null,
  } : undefined

  return {
    data,
    error: pairError || assetError || holdersError,
    isLoading: pairLoading || assetLoading,
  }
}
