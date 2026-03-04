import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface LatestDispenser {
  tx_hash: string
  asset: string
  asset_longname: string | null
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
  asset_longname: string | null
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
  status?: string
  offset?: number
  includeHidden?: boolean
  sort?: string
}

function buildDispensersUrl(filters?: DispenserFilters, limit: number = 250): string {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (filters?.status) params.set('status', filters.status)
  if (filters?.asset) params.set('asset', filters.asset)
  if (filters?.source) params.set('source', filters.source)
  if (filters?.tag) params.set('tag', filters.tag)
  if (filters?.offset) params.set('offset', String(filters.offset))
  if (filters?.includeHidden) params.set('include_hidden', '1')
  if (filters?.sort) params.set('sort', filters.sort)
  const qs = params.toString()
  return dexUrl(`/dispensers/latest?${qs}`)
}

function buildDispensesUrl(filters?: DispenserFilters, limit: number = 250): string {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (filters?.asset) params.set('asset', filters.asset)
  if (filters?.tag) params.set('tag', filters.tag)
  if (filters?.offset) params.set('offset', String(filters.offset))
  if (filters?.includeHidden) params.set('include_hidden', '1')
  if (filters?.sort) params.set('sort', filters.sort)
  const qs = params.toString()
  return dexUrl(`/dispenses/latest?${qs}`)
}

export function useDispensersLatest(filters?: DispenserFilters, limit: number = 250) {
  const { data, error, isLoading } = useDexSWR<{ dispensers: LatestDispenser[]; total: number }>(
    buildDispensersUrl(filters, limit),
    { keepPreviousData: true }
  )
  return {
    dispensers: data?.dispensers ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}

export function useDispensesLatest(filters?: DispenserFilters, limit: number = 250) {
  const { data, error, isLoading } = useDexSWR<{ dispenses: LatestDispense[]; total: number }>(
    buildDispensesUrl(filters, limit),
    { keepPreviousData: true }
  )
  return {
    dispenses: data?.dispenses ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}
