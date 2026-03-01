import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface LatestOrder {
  tx_hash: string
  pair: string
  base_asset: string
  quote_asset: string
  source: string
  side: string
  price: number
  amount: number
  give_remaining: number
  get_remaining: number
  expire_index: number
  block_index: number
  block_time: number
  status: string
}

interface LatestOrdersResponse {
  orders: LatestOrder[]
}

export type OrderTab = 'all' | 'open' | 'filled' | 'expiring' | 'expired' | 'cancelled'

export interface OrderFilters {
  asset?: string
  baseAsset?: string
  quoteAsset?: string
  source?: string
}

function buildUrl(tab: OrderTab, filters?: OrderFilters): string {
  const params = new URLSearchParams()

  if (tab === 'open' || tab === 'filled' || tab === 'expired' || tab === 'cancelled') {
    params.set('status', tab)
  } else if (tab === 'expiring') {
    params.set('status', 'open')
    params.set('sort', 'expire_index:asc')
  }

  if (filters?.asset) {
    params.set('asset', filters.asset)
  }
  if (filters?.baseAsset) {
    params.set('base_asset', filters.baseAsset)
  }
  if (filters?.quoteAsset) {
    params.set('quote_asset', filters.quoteAsset)
  }
  if (filters?.source) {
    params.set('source', filters.source)
  }

  const qs = params.toString()
  return dexUrl(`/orders/latest${qs ? `?${qs}` : ''}`)
}

export function useLatestOrders(tab: OrderTab, filters?: OrderFilters) {
  const { data, error, isLoading } = useSWR<LatestOrdersResponse>(
    buildUrl(tab, filters),
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    orders: data?.orders ?? [],
    error,
    isLoading,
  }
}
