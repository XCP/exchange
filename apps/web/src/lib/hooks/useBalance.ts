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

interface MempoolBalanceResponse {
  result: {
    event?: string
    params?: {
      address?: string
      asset?: string
      quantity_normalized?: number | string
    }
  }[]
}

export function useBalance(address: string | null, asset: string | null) {
  const confirmed = useSWR<CounterpartyBalanceResponse>(
    address && asset
      ? counterpartyUrl(
          `/addresses/${encodeURIComponent(address)}/balances/${encodeURIComponent(asset)}?verbose=true&type=address`
        )
      : null,
    fetcher,
    { refreshInterval: 60_000 }
  )
  const pendingQuery = address
    ? new URLSearchParams({
        addresses: address,
        event_name: 'DEBIT',
        verbose: 'true',
        limit: '100',
      })
    : null
  const pending = useSWR<MempoolBalanceResponse>(
    pendingQuery
      ? counterpartyUrl(`/addresses/mempool?${pendingQuery.toString()}`)
      : null,
    fetcher,
    { refreshInterval: 15_000, dedupingInterval: 5_000 },
  )

  /**
   * Counterparty can return more than one row for an address/asset pair.
   * UTXO-attached balances are not spendable by an ordinary order, dispenser,
   * or pool deposit, so exclude those and sum every address row exactly.
   *
   * Most importantly, no response is NOT a zero balance. `null` keeps loading
   * and failed reads distinct from a successful response containing no rows.
   */
  const rows = Array.isArray(confirmed.data?.result) ? confirmed.data.result : null
  const confirmedTotal = rows
    ? rows
        .filter((row) => !row.utxo)
        .reduce((sum, row) => sum.plus(big(row.quantity_normalized)), big(0))
    : null
  const pendingRows = Array.isArray(pending.data?.result) ? pending.data.result : null
  let pendingTotal = big(0)
  let malformedPending = false
  if (pendingRows && address && asset) {
    for (const row of pendingRows) {
      if (
        row.event !== 'DEBIT' ||
        row.params?.address !== address ||
        row.params.asset !== asset
      ) {
        continue
      }
      const quantity = big(row.params.quantity_normalized)
      if (!quantity.isFinite() || quantity.isNegative()) {
        malformedPending = true
        break
      }
      pendingTotal = pendingTotal.plus(quantity)
    }
  }

  const malformedConfirmed =
    confirmed.data !== undefined && (!confirmedTotal || !confirmedTotal.isFinite())
  const pendingKnown = pending.data !== undefined && !malformedPending
  const spendable =
    confirmedTotal?.isFinite() && pendingKnown
      ? confirmedTotal.minus(pendingTotal)
      : null
  const balanceNormalized = spendable?.isFinite()
    ? maxZero(spendable).toFixed()
    : null
  const balanceError =
    confirmed.data === undefined
      ? (confirmed.error as Error | undefined)
      : malformedConfirmed
        ? new Error('Counterparty returned an invalid balance response')
        : pending.data === undefined
          ? (pending.error as Error | undefined)
          : malformedPending
            ? new Error('Counterparty returned an invalid pending balance response')
            : undefined

  return {
    // A display/comparison number. `balanceNormalized` is the exact string and
    // is what Max buttons write into a field that later gets signed.
    balance: balanceNormalized === null ? null : num(balanceNormalized),
    balanceNormalized,
    pendingOutgoingNormalized: pendingKnown ? pendingTotal.toFixed() : null,
    balanceError,
    balanceLoading:
      (confirmed.data === undefined && confirmed.isLoading) ||
      (pending.data === undefined && pending.isLoading),
    refreshBalance: async () => {
      await Promise.all([confirmed.mutate(), pending.mutate()])
    },
  }
}

function maxZero(value: ReturnType<typeof big>) {
  return value.isNegative() ? big(0) : value
}
