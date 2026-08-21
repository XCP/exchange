import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'
import { big, num } from '@/utils/numeric'

interface CounterpartyBalanceResponse {
  result: {
    quantity: number | string
    quantity_normalized: number | string
    /** Present on balances attached to a UTXO rather than the address. */
    utxo?: string | null
  }[]
}

export function useBalance(address: string | null, asset: string | null) {
  const { data, error, isLoading, mutate } = useSWR<CounterpartyBalanceResponse>(
    address && asset
      ? counterpartyUrl(
          `/addresses/${encodeURIComponent(address)}/balances/${encodeURIComponent(asset)}?verbose=true&type=address`
        )
      : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  /**
   * Counterparty can return more than one row for an address/asset pair.
   * UTXO-attached balances are not spendable by an ordinary order, dispenser,
   * or pool deposit, so exclude those and sum every address row exactly.
   *
   * Most importantly, no response is NOT a zero balance. `null` keeps loading
   * and failed reads distinct from a successful response containing no rows.
   */
  const rows = Array.isArray(data?.result) ? data.result : null
  const total = rows
    ? rows
        .filter((row) => !row.utxo)
        .reduce((sum, row) => sum.plus(big(row.quantity_normalized)), big(0))
    : null
  const malformedResponse = data !== undefined && (!total || !total.isFinite())
  const balanceNormalized = total?.isFinite() ? total.toFixed() : null

  return {
    // A display/comparison number. `balanceNormalized` is the exact string and
    // is what Max buttons write into a field that later gets signed.
    balance: balanceNormalized === null ? null : num(balanceNormalized),
    balanceNormalized,
    balanceError:
      data === undefined
        ? (error as Error | undefined)
        : malformedResponse
          ? new Error('Counterparty returned an invalid balance response')
          : undefined,
    balanceLoading: data === undefined && isLoading,
    refreshBalance: mutate,
  }
}
