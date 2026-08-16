import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { holdersUrl } from '@/lib/api/counterparty'
import { formatAddress } from '@/utils/format-address'
import { formatCommas } from '@/utils/format-commas'
import { BURN_ADDRESSES, EXCHANGE_ADDRESSES } from '@/utils/constants'
import type { CounterpartyResponse } from '@/types/api'
import { big } from '@/utils/numeric'

/**
 * Quantities above 2^53 arrive as strings from the lossless JSON parse (see
 * lib/api/lossless-json), so both fields below can be either shape. Treating
 * them as plain numbers is what the parser exists to prevent.
 */
interface RawBalance {
  address: string
  quantity: number | string
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

function processHolders(
  balances: RawBalance[],
  totalSupply: number | string,
): ProcessedHolder[] {
  // BigNumber rather than `/`: a supply past 2^53 is a string here, and
  // coercing it back to a double reintroduces exactly the digits the
  // lossless parse preserved.
  const supply = big(totalSupply)
  const hasSupply = supply.isFinite() && supply.isGreaterThan(0)
  return balances.map(b => {
    const isBurn = BURN_ADDRESSES.includes(b.address)
    const exchangeName = EXCHANGE_ADDRESSES[b.address]
    const quantity = big(b.quantity)
    const pct = hasSupply ? quantity.dividedBy(supply).times(100).toNumber() : 0
    return {
      address: b.address,
      addressShort: formatAddress(b.address),
      balance: formatCommas(b.quantity_normalized),
      balanceRaw: quantity.toNumber(),
      percentage: Number.isFinite(pct) ? pct : 0,
      tag: isBurn ? 'Burn' : exchangeName ?? '',
    }
  })
}

export function useHolders(asset: string, totalSupply: number | string = 0) {
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
