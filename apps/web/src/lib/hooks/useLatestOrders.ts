import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface LatestOrder {
  tx_hash: string
  pair: string
  base_asset: string
  quote_asset: string
  source: string
  side: string
  price: number
  amount: number
  give_quantity: number
  get_quantity: number
  give_remaining: number
  get_remaining: number
  remaining: number
  expire_index: number
  block_index: number
  block_time: number
  status: string
  base_asset_longname: string | null
  quote_asset_longname: string | null
  collection_slug: string | null
  collection_name: string | null
}

interface LatestOrdersResponse {
  orders: LatestOrder[]
  total: number
}

export type OrderTab = 'all' | 'open' | 'filled' | 'expiring' | 'expired' | 'cancelled'

export interface OrderFilters {
  asset?: string
  baseAsset?: string
  quoteAsset?: string
  source?: string
  tag?: string
  side?: string
  sort?: string
  offset?: number
  includeHidden?: boolean
}

function buildUrl(tab: OrderTab, filters?: OrderFilters): string {
  const params = new URLSearchParams()

  if (tab === 'open' || tab === 'filled' || tab === 'cancelled') {
    params.set('status', tab)
  } else if (tab === 'expired') {
    params.set('status', 'expired')
    params.set('sort', 'expire_index:desc')
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
  if (filters?.tag) {
    params.set('tag', filters.tag)
  }
  if (filters?.side) {
    params.set('side', filters.side)
  }
  if (filters?.sort) {
    params.set('sort', filters.sort)
  }
  if (filters?.offset) {
    params.set('offset', String(filters.offset))
  }
  if (filters?.includeHidden) {
    params.set('include_hidden', '1')
  }

  const qs = params.toString()
  return dexUrl(`/orders/latest${qs ? `?${qs}` : ''}`)
}

export function useLatestOrders(tab: OrderTab, filters?: OrderFilters) {
  const { data, error, isLoading } = useDexSWR<LatestOrdersResponse>(
    buildUrl(tab, filters)
  )

  return {
    orders: data?.orders ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}
