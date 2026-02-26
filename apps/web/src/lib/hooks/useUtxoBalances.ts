import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'

export interface UtxoBalance {
  utxo: string          // "txid:vout"
  asset: string
  asset_longname: string | null
  quantity: number
  address: string
}

interface UtxoBalancesResponse {
  result: UtxoBalance[]
  next_cursor: string | null
  result_count: number
}

export function useUtxoBalances(address: string | null) {
  const { data, error, isLoading, mutate } = useSWR<UtxoBalancesResponse>(
    address ? counterpartyUrl(`/addresses/${address}/balances?type=utxo`) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    balances: data?.result ?? [],
    total: data?.result_count ?? 0,
    error,
    isLoading,
    mutate,
  }
}
