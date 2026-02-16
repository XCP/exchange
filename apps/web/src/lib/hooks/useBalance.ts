import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'

interface CounterpartyBalanceResponse {
  result: { quantity: number; quantity_normalized: string }[]
}

export function useBalance(address: string | null, asset: string | null) {
  const { data } = useSWR<CounterpartyBalanceResponse>(
    address && asset
      ? counterpartyUrl(`/addresses/${address}/balances/${asset}?verbose=true`)
      : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  const raw = data?.result?.[0]
  const parsed = raw ? parseFloat(raw.quantity_normalized) : 0
  return {
    balance: Number.isFinite(parsed) ? parsed : 0,
    balanceNormalized: raw?.quantity_normalized ?? '0',
  }
}
