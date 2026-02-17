import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface PairEntry {
  pair: string
  base_asset: string
  quote_asset: string
  last_price: number | null
  last_trade_time: number | null
  price_change_24h: number | null
  volume_24h: number | null
  trade_count_24h: number | null
  best_bid: number | null
  best_ask: number | null
}

interface PairsResponse {
  pairs: PairEntry[]
}

export function useAssetMarkets(asset: string) {
  const { data, error, isLoading } = useSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?base=${asset}&limit=50`) : null,
    fetcher,
    { refreshInterval: 60_000 }
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
  const { data: baseData, isLoading: baseLoading } = useSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?base=${asset}&timeframe=all&limit=50`) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )
  const { data: quoteData, isLoading: quoteLoading } = useSWR<PairsResponse>(
    asset ? dexUrl(`/pairs?quote=${asset}&timeframe=all&limit=50`) : null,
    fetcher,
    { refreshInterval: 60_000 }
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
