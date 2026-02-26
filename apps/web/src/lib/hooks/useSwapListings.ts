import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface SwapListing {
  id: string
  seller_address: string
  asset: string
  asset_longname: string | null
  asset_quantity: number
  utxo_txid: string
  utxo_vout: number
  price_sats: number
  status: string
  broadcast_txid: string | null
  buyer_address: string | null
  tx_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

interface SwapListingsResponse {
  listings: SwapListing[]
  total: number
  limit: number
  offset: number
}

export function useSwapListings(params?: {
  asset?: string
  seller?: string
  status?: string
  sort?: string
  limit?: number
  offset?: number
}) {
  const qp = new URLSearchParams()
  if (params?.asset) qp.set('asset', params.asset)
  if (params?.seller) qp.set('seller', params.seller)
  if (params?.status) qp.set('status', params.status)
  if (params?.sort) qp.set('sort', params.sort)
  if (params?.limit) qp.set('limit', String(params.limit))
  if (params?.offset) qp.set('offset', String(params.offset))

  const { data, error, isLoading, mutate } = useSWR<SwapListingsResponse>(
    dexUrl(`/swaps?${qp.toString()}`),
    fetcher,
    { refreshInterval: 15_000 }
  )

  return {
    listings: data?.listings ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
    mutate,
  }
}
