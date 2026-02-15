import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { holdersUrl } from '@/lib/api/counterparty'
import { formatAddress } from '@/utils/format-address'
import { formatAmountSimple } from '@/utils/format-amount-simple'
import { BURN_ADDRESSES } from '@/utils/constants'
import type { CounterpartyResponse } from '@/types/api'

interface RawBalance {
  address: string
  quantity: number
  quantity_normalized: string
}

export interface ProcessedHolder {
  address: string
  addressShort: string
  balance: string
  balanceRaw: number
  percentage: number
  tag: string
}

function processHolders(balances: RawBalance[], totalSupply: number): ProcessedHolder[] {
  return balances.map(b => {
    const isBurn = BURN_ADDRESSES.includes(b.address)
    const pct = totalSupply > 0 ? (b.quantity / totalSupply) * 100 : 0
    return {
      address: b.address,
      addressShort: formatAddress(b.address),
      balance: formatAmountSimple(b.quantity_normalized),
      balanceRaw: b.quantity,
      percentage: pct,
      tag: isBurn ? 'Burn' : '',
    }
  })
}

export function useHolders(asset: string, totalSupply: number = 0) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<RawBalance[]>>(
    asset ? holdersUrl(asset) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  const holders = data?.result ? processHolders(data.result, totalSupply) : []

  return {
    holders,
    total: data?.result_count ?? 0,
    error,
    isLoading,
  }
}
