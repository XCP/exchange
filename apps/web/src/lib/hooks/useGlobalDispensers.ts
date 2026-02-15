import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { globalDispensersUrl, globalDispensesUrl } from '@/lib/api/counterparty'
import type { Dispenser, Dispense } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'

export function useGlobalDispensers(limit: number = 50) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispenser[]>>(
    globalDispensersUrl(limit),
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    dispensers: data?.result ?? [],
    error,
    isLoading,
  }
}

export function useGlobalDispenses(limit: number = 50) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispense[]>>(
    globalDispensesUrl(limit),
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    dispenses: data?.result ?? [],
    error,
    isLoading,
  }
}
