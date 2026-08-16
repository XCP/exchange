import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { mempoolDispensesUrl } from '@/lib/api/counterparty'

/**
 * Dispensers with an unconfirmed buy already in flight.
 *
 * A dispenser is first-come, first-served at the block level: two payments in
 * the same block are paid in transaction order, and a dispenser holding one
 * lot pays the first and refunds nobody. Sending BTC to a dispenser somebody
 * else is already draining is the single most expensive mistake this form can
 * let you make — the money leaves, the asset does not arrive.
 *
 * The mempool knows. Counterparty parses unconfirmed transactions and emits
 * DISPENSE events for them, keyed by `dispenser_tx_hash`, which is exactly
 * the identity the open-dispenser list uses.
 *
 * This does NOT hide the dispenser. It marks it, and routes around it when it
 * can. Hiding would be a lie in the other direction: a mempool dispense can be
 * replaced, dropped or mined against a dispenser deep enough to serve both
 * buyers, and a row vanishing with no explanation is worse than a row that
 * says why it is greyed.
 */

interface MempoolEvent {
  tx_hash: string
  event: string
  params: {
    dispenser_tx_hash?: string
    asset?: string
    dispense_quantity?: number
    btc_amount?: number
  }
}

interface MempoolResponse {
  result: MempoolEvent[]
}

export function useMempoolDispenses() {
  const { data } = useSWR<MempoolResponse>(mempoolDispensesUrl(), fetcher, {
    // Faster than the 30s the dispenser list uses: this is the field that
    // decays into a wrong answer, and it decays within one block.
    refreshInterval: 15_000,
    dedupingInterval: 10_000,
    // A mempool read that fails should leave the form working, not empty.
    shouldRetryOnError: false,
  })

  const pending = new Set<string>()
  for (const e of data?.result ?? []) {
    const hash = e.params?.dispenser_tx_hash
    if (hash) pending.add(hash)
  }
  return pending
}
