import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { big, num } from '@/utils/numeric'

interface AddressStats {
  funded_txo_sum: number
  spent_txo_sum: number
}

interface MempoolAddress {
  chain_stats: AddressStats
  mempool_stats: AddressStats
}

/**
 * Spendable bitcoin at an address, in satoshis.
 *
 * Counterparty's balances endpoint only knows about Counterparty assets, so
 * BTC has to come from a chain source — mempool.space, which this app already
 * uses for fee rates.
 *
 * Unconfirmed movement is included: change from a transaction you broadcast a
 * minute ago is spendable, and a balance that ignored it would tell someone
 * they cannot afford something they just paid for.
 *
 * This is the whole address balance, not a coin-selected spendable total. It
 * is right for sizing a purchase and NOT precise enough to promise a
 * transaction will build — miner fees and dust limits come off the top, which
 * is why callers keep headroom rather than offering a true "max".
 */
export function useBtcBalance(address: string | null) {
  const { data, error, isLoading } = useSWR<MempoolAddress>(
    address ? `https://mempool.space/api/address/${address}` : null,
    fetcher,
    { refreshInterval: 60_000 },
  )

  const sats = data
    ? num(
        big(data.chain_stats.funded_txo_sum)
          .minus(data.chain_stats.spent_txo_sum)
          .plus(data.mempool_stats.funded_txo_sum)
          .minus(data.mempool_stats.spent_txo_sum),
      )
    : 0

  return { sats: Math.max(0, sats), isLoading, error }
}
