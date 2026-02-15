import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { mempoolDispensesUrl } from '@/lib/api/counterparty'
import type { CounterpartyResponse } from '@/types/api'

interface MempoolEvent {
  event_index: number
  event: string
  params: {
    asset: string
    source: string
    destination: string
    dispense_quantity: number
    dispenser_tx_hash: string
    btc_amount: number
    dispense_quantity_normalized?: string
    btc_amount_normalized?: string
  }
  tx_hash: string
}

export function usePendingDispenses(dispenserSource: string | undefined) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<MempoolEvent[]>>(
    dispenserSource ? mempoolDispensesUrl(dispenserSource) : null,
    fetcher,
    { refreshInterval: 10_000 }
  )

  const events = data?.result ?? []

  return {
    pendingCount: events.length,
    pendingEvents: events,
    error,
    isLoading,
  }
}
