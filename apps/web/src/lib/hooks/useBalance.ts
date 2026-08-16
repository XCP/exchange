import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'
import { num } from '@/utils/numeric'

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
  return {
    // A display/comparison number. `balanceNormalized` is the exact string and
    // is what Max buttons write into a field that later gets signed.
    balance: num(raw?.quantity_normalized),
    balanceNormalized: raw?.quantity_normalized ?? '0',
  }
}
