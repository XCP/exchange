import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import type { Timeframe } from '@/lib/hooks/useAnalytics'

export type MarketSort =
  | 'volume'
  | 'base_volume'
  | 'trades'
  | 'price_change'
  | 'last_price'
  | 'high'
  | 'low'
  | 'last_trade_time'

export interface MarketEntry {
  pair: string
  base_asset: string
  quote_asset: string
  base_asset_longname: string | null
  quote_asset_longname: string | null
  last_price: number | null
  last_trade_time: number | null
  last_side: string | null
  /** Quote-denominated volume over the selected window. */
  volume: number | null
  base_volume: number | null
  trade_count: number | null
  price_change: number | null
  high: number | null
  low: number | null
  open_orders: number
  best_bid: number | null
  best_ask: number | null
  spread: number | null
}

interface MarketsResponse {
  timeframe: string
  markets: MarketEntry[]
  total: number
  limit: number
  offset: number
}

export function useMarkets({
  timeframe,
  sort = 'volume',
  order = 'desc',
  limit = 10,
  offset = 0,
  quote,
  includeHidden = false,
}: {
  timeframe: Timeframe
  sort?: MarketSort
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
  quote?: string
  includeHidden?: boolean
}) {
  const params = new URLSearchParams({
    timeframe,
    sort,
    order,
    limit: String(limit),
    offset: String(offset),
  })
  if (quote) params.set('quote', quote)
  if (includeHidden) params.set('include_hidden', '1')

  const { data, error, isLoading } = useDexSWR<MarketsResponse>(
    dexUrl(`/markets?${params.toString()}`),
    { keepPreviousData: true }
  )

  // The window-scoped fields are aliased server-side (`volume`, `trade_count`
  // …). An API predating that sends the raw `volume_24h` columns instead, so
  // normalize here rather than making every consumer check both — the palette
  // and the markets table both read `volume`.
  const markets = (data?.markets ?? []).map((m) => ({
    ...m,
    volume: m.volume ?? (m as unknown as { volume_24h?: number }).volume_24h ?? null,
    trade_count:
      m.trade_count ?? (m as unknown as { trade_count_24h?: number }).trade_count_24h ?? null,
    price_change:
      m.price_change ?? (m as unknown as { price_change_24h?: number }).price_change_24h ?? null,
  }))

  return {
    markets,
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}
