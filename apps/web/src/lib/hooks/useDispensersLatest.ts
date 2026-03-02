import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface LatestDispenser {
  tx_hash: string
  asset: string
  source: string
  give_quantity: number
  escrow_quantity: number
  give_remaining: number
  satoshi_price: number
  price: number
  dispense_count: number
  status: number
  block_index: number
  block_time: number
}

export interface LatestDispense {
  tx_hash: string
  dispense_index: number
  dispenser_tx_hash: string
  source: string
  destination: string
  asset: string
  dispense_quantity: number
  btc_amount: number
  price: number
  block_index: number
  block_time: number
}

export interface DispenserFilters {
  asset?: string
  source?: string
  tag?: string
}

function buildDispensersUrl(filters?: DispenserFilters, limit: number = 50): string {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (filters?.asset) params.set('asset', filters.asset)
  if (filters?.source) params.set('source', filters.source)
  if (filters?.tag) params.set('tag', filters.tag)
  const qs = params.toString()
  return dexUrl(`/dispensers/latest?${qs}`)
}

function buildDispensesUrl(filters?: DispenserFilters, limit: number = 50): string {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (filters?.asset) params.set('asset', filters.asset)
  if (filters?.tag) params.set('tag', filters.tag)
  const qs = params.toString()
  return dexUrl(`/dispenses/latest?${qs}`)
}

export function useDispensersLatest(filters?: DispenserFilters, limit: number = 50) {
  const { data, error, isLoading } = useDexSWR<{ dispensers: LatestDispenser[] }>(
    buildDispensersUrl(filters, limit)
  )
  return {
    dispensers: data?.dispensers ?? [],
    error,
    isLoading,
  }
}

export function useDispensesLatest(filters?: DispenserFilters, limit: number = 50) {
  const { data, error, isLoading } = useDexSWR<{ dispenses: LatestDispense[] }>(
    buildDispensesUrl(filters, limit)
  )
  return {
    dispenses: data?.dispenses ?? [],
    error,
    isLoading,
  }
}
