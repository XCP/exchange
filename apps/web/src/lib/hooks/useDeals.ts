import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface DealEntry {
  listing_id: string
  listing_type: 'order' | 'dispenser'
  asset: string
  asset_longname: string | null
  collections: { slug: string; name: string }[]
  quote: string

  // This listing
  listing_price: number
  listing_qty: number | null
  listing_source: string | null

  // Price context
  fair_value: number
  fair_value_method: string
  discount_pct: number | null
  last_price: number
  highest_price: number | null
  lowest_price: number | null
  average_price: number
  median_price: number
  recent_sales: { price: number; amount: number; date: number; side: string }[]

  // Dispenser context
  dispenser_cheapest_btc: number | null
  dispenser_active: number
  dispenser_unique_buyers: number

  // Liquidity & frequency
  total_trades: number
  avg_days_between_trades: number
  last_trade_days_ago: number
  active_buy_orders: number
  unique_traders: number

  // Scoring
  score: number
  required_edge_pct: number
}

interface DealsResponse {
  deals: DealEntry[]
  total: number
  limit: number
  updated_at: number
}

const PAGE_SIZE = 50

const DEALS_SWR_OPTS = {
  dedupingInterval: 2 * 60 * 1000,
  revalidateOnFocus: false,
}

export function useDeals(
  sort: string = 'score',
  quote?: string,
  page: number = 1,
) {
  const offset = (page - 1) * PAGE_SIZE
  const params = new URLSearchParams({
    sort,
    limit: '500',
  })
  if (quote) params.set('quote', quote)

  const { data, error, isLoading } = useDexSWR<DealsResponse>(
    dexUrl(`/deals?${params}`),
    DEALS_SWR_OPTS,
  )

  const all = data?.deals ?? []
  const paged = all.slice(offset, offset + PAGE_SIZE)
  const total = all.length

  return {
    deals: paged,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    updatedAt: data?.updated_at ?? null,
    error,
    isLoading,
  }
}
