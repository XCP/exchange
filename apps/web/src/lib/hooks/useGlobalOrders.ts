import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { globalOrdersUrl } from '@/lib/api/counterparty'
import type { Order } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'

export function useGlobalOrders(limit: number = 50, status?: string, sort?: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Order[]>>(
    globalOrdersUrl(limit, status, sort),
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    orders: data?.result ?? [],
    error,
    isLoading,
  }
}
