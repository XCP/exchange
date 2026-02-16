import useSWR from 'swr'
import { fetcher, dexUrl, counterpartyUrl } from '@/lib/api/client'

interface PortfolioOrder {
  pair: string
  base_asset: string
  quote_asset: string
  side: string
  price: number
  amount: number
  give_remaining: number
  get_remaining: number
  block_time: number
  tx_hash: string
  expire_index: number
  status: string
}

interface OrdersResponse {
  address: string
  orders: PortfolioOrder[]
}

export function usePortfolioOrders(address: string | null) {
  const { data, error, isLoading } = useSWR<OrdersResponse>(
    address ? dexUrl(`/portfolio/${address}/orders`) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )
  return { orders: data?.orders ?? [], error, isLoading }
}

interface PortfolioDispenser {
  tx_hash: string
  asset: string
  source: string
  give_quantity_normalized: string
  give_remaining_normalized: string
  satoshirate: number
  price_normalized: string
  status: number
  dispense_count: number
  block_time: number
}

interface DispensersResponse {
  address: string
  dispensers: PortfolioDispenser[]
}

export function usePortfolioDispensers(address: string | null) {
  const { data, error, isLoading } = useSWR<DispensersResponse>(
    address ? dexUrl(`/portfolio/${address}/dispensers`) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )
  return { dispensers: data?.dispensers ?? [], error, isLoading }
}

interface CounterpartyBalance {
  asset: string
  quantity: number
  quantity_normalized: string
}

interface CounterpartyBalancesResponse {
  result: CounterpartyBalance[]
}

export function usePortfolioBalances(address: string | null) {
  const { data, error, isLoading } = useSWR<CounterpartyBalancesResponse>(
    address ? counterpartyUrl(`/addresses/${address}/balances?verbose=true&limit=200`) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )
  const balances = (data?.result ?? []).filter((b) => parseFloat(b.quantity_normalized) > 0)
  return { balances, error, isLoading }
}

export interface PortfolioBid {
  pair: string
  base_asset: string
  quote_asset: string
  price: number
  amount: number
  source: string
  block_time: number
  tx_hash: string
  expire_index: number
}

interface BidsResponse {
  address: string
  asset_count: number
  bids: PortfolioBid[]
}

export function usePortfolioBids(address: string | null) {
  const { data, error, isLoading } = useSWR<BidsResponse>(
    address ? dexUrl(`/portfolio/${address}/bids`) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )
  return { bids: data?.bids ?? [], error, isLoading }
}
