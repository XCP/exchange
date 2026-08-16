import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import type { Timeframe } from '@/lib/hooks/useAnalytics'
import type { AssetKind } from '@/lib/asset-kind'

export type AssetSort =
  | 'xcp_volume'
  | 'base_volume'
  | 'trades'
  | 'markets'
  | 'quote_markets'
  | 'dispensers'
  | 'last_trade_time'
  | 'supply'
  | 'first_issuance'

export interface AssetEntry {
  asset: string
  asset_longname: string | null
  divisible: 0 | 1
  supply_normalized: number | null
  first_issuance_block_index: number | null
  /**
   * Volume in XCP, from XCP-quoted markets only. The one figure that compares
   * across rows — see the note in apps/api/src/routes/assets.ts on why it is
   * restricted rather than converted.
   */
  xcp_volume: number
  /** Units of the asset itself, summed over its markets. Compares within a row, not across. */
  base_volume: number
  trade_count: number
  /** Markets that price this asset (it is the base). */
  market_count: number
  /** Markets priced IN this asset (it is the quote). The money signal. */
  quote_market_count: number
  active_dispensers: number
  cheapest_price: number | null
  last_trade_time: number | null
  last_dispense_time: number | null
  /** Its deepest market in the window, and that market's price. */
  top_pair: string | null
  top_quote: string | null
  top_price: number | null
  top_price_change: number | null
  kind: AssetKind
}

interface AssetsResponse {
  timeframe: string
  assets: AssetEntry[]
  total: number
  limit: number
  offset: number
}

export function useAssets({
  timeframe,
  sort = 'xcp_volume',
  order = 'desc',
  limit = 50,
  offset = 0,
  kind,
  includeHidden = false,
  assets: assetFilter,
}: {
  timeframe: Timeframe
  sort?: AssetSort
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
  kind?: AssetKind | null
  includeHidden?: boolean
  /**
   * Restrict to an explicit set of assets. For lists whose membership is
   * decided somewhere else — /explore/launches gets its names from xcp.fun
   * and only asks this route what they are worth.
   *
   * Undefined means no filter. An EMPTY array means a filter that matches
   * nothing, which is the honest answer while the set is still loading or
   * genuinely empty; the alternative is briefly rendering every asset.
   */
  assets?: string[]
}) {
  const params = new URLSearchParams({
    timeframe,
    sort,
    order,
    limit: String(limit),
    offset: String(offset),
  })
  if (kind) params.set('kind', kind)
  if (includeHidden) params.set('include_hidden', '1')
  if (assetFilter) params.set('assets', assetFilter.join(','))

  const { data, error, isLoading } = useDexSWR<AssetsResponse>(
    dexUrl(`/assets?${params.toString()}`),
    { keepPreviousData: true },
  )

  return {
    assets: data?.assets ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  }
}
