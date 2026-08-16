import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface PairEntry {
  pair: string
  base_asset: string
  quote_asset: string
  base_asset_longname: string | null
  last_price: number | null
  last_trade_time: number | null
  price_change_24h: number | null
  volume_24h: number | null
  /**
   * Volume in the BASE asset's own units. The `volume_*` fields are
   * QUOTE-denominated, so they are only comparable within a single market —
   * ranking an asset's markets by them compares XCP against BTC against SJCX
   * as though they were one currency.
   */
  base_volume_24h: number | null
  total_base_volume: number | null
  trade_count_24h: number | null
  best_bid: number | null
  best_ask: number | null
}

interface PairsResponse {
  pairs: PairEntry[]
}

export function useAssetMarkets(asset: string) {
  const { data, error, isLoading } = useDexSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?base=${asset}&limit=50`) : null
  )

  return {
    pairs: data?.pairs ?? [],
    error,
    isLoading,
  }
}

/**
 * Fetch all pairs where asset is either base OR quote.
 * Useful for asset hub pages that need the full picture.
 */
export function useAllAssetMarkets(asset: string) {
  const { data: baseData, isLoading: baseLoading } = useDexSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?base=${asset}&timeframe=all&limit=50`) : null
  )
  const { data: quoteData, isLoading: quoteLoading } = useDexSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?quote=${asset}&timeframe=all&limit=50`) : null
  )

  const basePairs = baseData?.pairs ?? []
  const quotePairs = quoteData?.pairs ?? []

  // Merge, deduplicate by pair name
  const seen = new Set<string>()
  const all: PairEntry[] = []
  for (const p of [...basePairs, ...quotePairs]) {
    if (!seen.has(p.pair)) {
      seen.add(p.pair)
      all.push(p)
    }
  }

  return {
    pairs: all,
    basePairs,
    quotePairs,
    isLoading: baseLoading || quoteLoading,
  }
}
