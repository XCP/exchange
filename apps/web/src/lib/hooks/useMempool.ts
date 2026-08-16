import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface MempoolEntry {
  tx_hash: string
  /** order | match | dispense | dispenser | send | issuance | destruction | sweep */
  kind: string
  event: string
  timestamp: number | null
  source: string | null
  asset: string | null
  give_asset: string | null
  get_asset: string | null
  give_quantity: number | null
  get_quantity: number | null
  dispenser_tx_hash: string | null
  btc_amount: number | null
}

interface MempoolResponse {
  entries: MempoolEntry[]
  count: number
  upstream_ok: boolean
}

/**
 * What is currently in flight, from our own edge-cached endpoint.
 *
 * This used to be a direct browser call to Counterparty's public node, once
 * per open tab every 15 seconds. That scales with our traffic and costs
 * someone else's infrastructure, so the fan-out now collapses at our edge
 * instead — see apps/api/src/routes/mempool.ts.
 *
 * The poll interval stays short because this is the one dataset on the site
 * that decays into a WRONG answer rather than a merely stale one: a dispenser
 * someone else is already draining, an order about to fill. The endpoint's own
 * 10s TTL is what actually bounds upstream load, so polling faster here costs
 * us nothing beyond a conditional request.
 */
export function useMempool(kind?: string) {
  const { data, isLoading } = useSWR<MempoolResponse>(
    dexUrl(`/mempool${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
    fetcher,
    {
      refreshInterval: 15_000,
      dedupingInterval: 10_000,
      // A mempool read that fails must leave the page working. It is an
      // enrichment, never a dependency.
      shouldRetryOnError: false,
      keepPreviousData: true,
    }
  )

  return {
    entries: data?.entries ?? [],
    count: data?.count ?? 0,
    upstreamOk: data?.upstream_ok ?? true,
    isLoading,
  }
}

/**
 * Dispensers with an unconfirmed buy already in flight.
 *
 * A dispenser is first-come, first-served at the block level: two payments in
 * the same block are paid in transaction order, and a dispenser holding one lot
 * pays the first and refunds nobody. Sending BTC to a dispenser somebody else
 * is already draining is the single most expensive mistake the buy form can
 * let you make — the money leaves, the asset does not arrive.
 *
 * This does NOT hide the dispenser. It marks it, and the form routes around it
 * when it can. Hiding would be a lie in the other direction: a mempool dispense
 * can be replaced, dropped, or mined against a dispenser deep enough to serve
 * both buyers, and a row vanishing with no explanation is worse than a row that
 * says why it is greyed.
 */
export function useMempoolDispenses(): Set<string> {
  const { entries } = useMempool('dispense')
  const pending = new Set<string>()
  for (const e of entries) if (e.dispenser_tx_hash) pending.add(e.dispenser_tx_hash)
  return pending
}
