import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { assetDispensersUrl, assetDispensesUrl } from '@/lib/api/counterparty'
import type { Dispenser, Dispense } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'

export function useAssetDispensers(asset: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispenser[]>>(
    asset ? assetDispensersUrl(asset) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    dispensers: data?.result ?? [],
    error,
    isLoading,
  }
}

export function useAssetDispenses(asset: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispense[]>>(
    asset ? assetDispensesUrl(asset) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    dispenses: data?.result ?? [],
    error,
    isLoading,
  }
}
