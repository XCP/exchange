import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

/** One fill of an asset, from that asset's point of view. */
export interface AssetTrade {
  kind: 'order' | 'pool' | 'dispense'
  block_time: number
  block_index: number
  tx_hash: string
  /** Whether this asset was bought or sold. */
  side: 'buy' | 'sell'
  /** Amount of THIS asset that changed hands. */
  amount: number
  /** Price in `quote_asset` per unit of this asset. */
  price: number
  quote_asset: string
  counterparty: string | null
}

export type AssetVenue = 'all' | 'dex' | 'dispensers'

/**
 * Every fill of an asset, across every pair and venue, newest first.
 *
 * An asset lives in many markets at once — PEPECASH trades in 44 — so a
 * per-pair feed answers "what happened in this market" when the question is
 * "what happened to this asset". This is the second question.
 */
export function useAssetTrades(asset: string | null, venue: AssetVenue = 'all', limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (venue !== 'all') params.set('venue', venue)

  const { data, error, isLoading } = useDexSWR<{ trades: AssetTrade[] }>(
    asset ? dexUrl(`/asset/${encodeURIComponent(asset)}/trades?${params}`) : null,
  )

  return { trades: data?.trades ?? [], error, isLoading }
}
