import useSWR from 'swr'
import { counterpartyUrl, dexUrl, fetcher } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface PoolSummary {
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  display_base_asset?: string
  display_quote_asset?: string
  display_pair?: string
  display_pair_slug?: string
  display_price?: number | null
  display_base_reserve?: number
  display_quote_reserve?: number
  reserve_a: number
  reserve_b: number
  reserve_a_raw: number
  reserve_b_raw: number
  opened_tx_hash: string | null
  opened_block_index: number | null
  opened_block_time: number | null
  last_tx_hash: string | null
  last_block_index: number | null
  last_block_time: number | null
  deposit_count: number
  withdrawal_count: number
  match_count: number
  restart_count: number
  total_fees_a: number
  total_fees_b: number
  total_fees_a_raw: number
  total_fees_b_raw: number
  fees_24h_a?: number
  fees_24h_b?: number
  fees_1y_a?: number
  fees_1y_b?: number
  fees_30d_a?: number
  fees_30d_b?: number
  volume_a?: number
  volume_b?: number
  volume_24h_a?: number
  volume_24h_b?: number
  volume_1y_a?: number
  volume_1y_b?: number
  volume_30d_a?: number
  volume_30d_b?: number
  implied_fees_24h_a?: number
  implied_fees_24h_b?: number
  implied_fees_1y_a?: number
  implied_fees_1y_b?: number
  implied_fees_30d_a?: number
  implied_fees_30d_b?: number
  implied_fee_apy_24h?: number | null
  implied_fee_apy_1y?: number | null
  implied_fee_apy_30d?: number | null
  display_fees_24h_base?: number
  display_fees_24h_quote?: number
  display_fees_1y_base?: number
  display_fees_1y_quote?: number
  display_fees_30d_base?: number
  display_fees_30d_quote?: number
  display_volume_base?: number
  display_volume_quote?: number
  display_volume_24h_base?: number
  display_volume_24h_quote?: number
  display_volume_1y_base?: number
  display_volume_1y_quote?: number
  display_volume_30d_base?: number
  display_volume_30d_quote?: number
  display_implied_fees_24h_base?: number
  display_implied_fees_24h_quote?: number
  display_implied_fees_1y_base?: number
  display_implied_fees_1y_quote?: number
  display_implied_fees_30d_base?: number
  display_implied_fees_30d_quote?: number
  updated_at: number
}

export interface PoolDeposit {
  event_index: number
  tx_hash: string
  tx_index: number
  block_index: number
  block_time: number
  source: string
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  quantity_a: number
  quantity_b: number
  quantity_minted: number
  is_restart: number
  status: string
}

export interface PoolWithdrawal {
  event_index: number
  tx_hash: string
  tx_index: number
  block_index: number
  block_time: number
  source: string
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  quantity_destroyed: number
  quantity_a: number
  quantity_b: number
  status: string
}

export interface PoolMatch {
  event_index: number
  tx_hash: string
  tx_index: number
  block_index: number
  block_time: number
  source: string
  lp_asset: string
  pair: string
  asset_a: string
  asset_b: string
  forward_asset: string
  backward_asset: string
  forward_quantity: number
  backward_quantity: number
  reserve_a_before: number | null
  reserve_b_before: number | null
  reserve_a_after: number | null
  reserve_b_after: number | null
  effective_price: number | null
  price_before: number | null
  price_after: number | null
  fee_asset: string
  fee_quantity: number
  fee_bps: number
  order_tx_hash: string | null
  status: string
}

export interface PoolHolder {
  address: string
  holder: string
  holder_type: 'address' | 'utxo'
  owner_address: string | null
  balance: number
  balance_raw: number
  implied_fees_a: number
  implied_fees_b: number
}

export interface PoolAddressPosition {
  pool: PoolSummary
  address: string
  balance: {
    balance: number
    balance_raw: number
    updated_block_index: number | null
    updated_block_time: number | null
  }
  total_lp_supply_raw: number
  total_lp_supply: number
  ownership: number
  claim: Record<string, number>
  net_deposited: Record<string, number>
  claim_vs_deposits: Record<string, number>
  position_delta: Record<string, number>
  display_claim: PoolDisplayAmounts
  display_net_deposited: PoolDisplayAmounts
  display_claim_vs_deposits: PoolDisplayAmounts
  display_position_delta: PoolDisplayAmounts
  hodl_comparison: {
    quote_asset: string
    pool_price_in_quote: number | null
    claim_value_in_quote: number | null
    hold_value_in_quote: number | null
    divergence_value_in_quote: number | null
    divergence_pct: number | null
  }
  position_basis: {
    type: 'deposit_basis_estimate'
    caveats: string[]
  }
  deposits: {
    deposited_a: number
    deposited_b: number
    minted_lp: number
  }
  withdrawals: {
    withdrawn_a: number
    withdrawn_b: number
    burned_lp: number
  }
  fees: {
    fee_asset: string
    fee_quantity: number
    fee_quantity_raw: number
  }[]
}

export interface AddressPoolSummary extends PoolSummary {
  balance: number
  balance_raw: number
  total_lp_supply_raw: number
  total_lp_supply: number
  implied_fees_a: number
  implied_fees_b: number
}

export interface PoolDepositQuote {
  first_deposit: boolean
  asset_a: string
  asset_b: string
  quantity_a_required: number | null
  quantity_b_required: number | null
  quantity_minted_estimate: number | null
  message?: string
}

export interface PoolWithdrawQuote {
  pool_exists: boolean
  asset_a?: string
  asset_b?: string
  quantity?: number
  supply?: number
  quantity_a_estimate?: number
  quantity_b_estimate?: number
  message?: string
}

interface PoolsResponse {
  pools: PoolSummary[]
  total: number
  summary: PoolListSummary
  limit: number
  offset: number
}

export interface PoolListSummary {
  total_pools: number
  active_pools: number
  tf_active_pools: number
  new_pools: number
  tf_volume_xcp: number
  total_trades: number
  tf_trades: number
  tf_non_xcp_trades: number
  total_deposits: number
  tf_deposits: number
  total_withdrawals: number
  tf_withdrawals: number
  xcp_liquidity: number
  xcp_pool_count: number
}

interface PoolResponse {
  pool: PoolSummary
  total_lp_supply_raw: number
  total_lp_supply: number
  holders: PoolHolder[]
  deposits: PoolDeposit[]
  withdrawals: PoolWithdrawal[]
  matches: PoolMatch[]
}

export type PoolSortKey =
  | 'match_count'
  | 'deposit_count'
  | 'withdrawal_count'
  | 'last_block_time'
  | 'opened_block_time'
  | 'total_fees_value'
  | 'fees_24h_value'
  | 'fees_1y_value'
  | 'fees_30d_value'
  | 'total_volume_value'
  | 'volume_24h_value'
  | 'volume_1y_value'
  | 'volume_30d_value'
  | 'implied_fee_apy_24h'
  | 'implied_fee_apy_1y'
  | 'implied_fee_apy_30d'

export type PoolStatusFilter = 'all' | 'active' | 'inactive'

export function usePools(
  offset = 0,
  limit = 50,
  sort: PoolSortKey = 'match_count',
  order: 'asc' | 'desc' = 'desc',
  filters?: {
    status?: PoolStatusFilter
    includeHidden?: boolean
    tag?: string | null
    timeframe?: '24h' | '30d' | '1y' | 'all'
  }
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort,
    order,
  })
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters?.includeHidden) params.set('include_hidden', '1')
  if (filters?.tag) params.set('tag', filters.tag)
  if (filters?.timeframe) params.set('timeframe', filters.timeframe)

  const { data, error, isLoading } = useDexSWR<PoolsResponse>(
    dexUrl(`/pools?${params.toString()}`)
  )

  return {
    pools: data?.pools ?? [],
    total: data?.total ?? 0,
    summary: data?.summary ?? {
      total_pools: 0,
      active_pools: 0,
      tf_active_pools: 0,
      new_pools: 0,
      tf_volume_xcp: 0,
      total_trades: 0,
      tf_trades: 0,
      tf_non_xcp_trades: 0,
      total_deposits: 0,
      tf_deposits: 0,
      total_withdrawals: 0,
      tf_withdrawals: 0,
      xcp_liquidity: 0,
      xcp_pool_count: 0,
    },
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    error,
    isLoading,
  }
}

/** Find the AMM pool for a trading pair (either asset ordering), or null if none exists. */
export function usePoolByPair(baseAsset: string | null, quoteAsset: string | null) {
  const params = new URLSearchParams({ limit: '100' })
  if (baseAsset) params.set('asset', baseAsset)
  const { data, error, isLoading } = useDexSWR<PoolsResponse>(
    baseAsset && quoteAsset ? dexUrl(`/pools?${params.toString()}`) : null
  )
  const pool =
    data?.pools?.find(
      (p) =>
        (p.asset_a === baseAsset && p.asset_b === quoteAsset) ||
        (p.asset_a === quoteAsset && p.asset_b === baseAsset)
    ) ?? null
  return { pool, error, isLoading }
}

export interface PoolSwapQuote {
  estimated_output: number
  pool_output: number
  book_output: number
  book_orders_matched: number
  give_remaining: number
  effective_price: number
  price_impact: number
  pool_exists: boolean
  fee_bps?: number
  fee_amount?: number
}

/**
 * Best-execution quote for selling `sellQuantityRaw` of `sellAsset` to receive `receiveAsset`,
 * routed across the order book AND the pool (Counterparty's native /quote endpoint).
 */
export function usePoolSwapQuote(
  sellAsset: string | null,
  receiveAsset: string | null,
  sellQuantityRaw: number
) {
  const enabled = !!sellAsset && !!receiveAsset && sellQuantityRaw > 0
  const { data, error, isLoading } = useSWR<{ result: PoolSwapQuote }>(
    enabled
      ? counterpartyUrl(`/pools/${sellAsset}/${receiveAsset}/quote?quantity=${sellQuantityRaw}&verbose=true`)
      : null,
    fetcher,
    { keepPreviousData: true, dedupingInterval: 5000 }
  )
  return { quote: data?.result ?? null, isLoading, error }
}

export interface PoolDisplayAmounts {
  base_asset: string
  quote_asset: string
  base_quantity: number
  quote_quantity: number
}

export function usePool(lpAsset: string | null, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) })
  const { data, error, isLoading } = useDexSWR<PoolResponse>(
    lpAsset ? dexUrl(`/pools/${encodeURIComponent(lpAsset)}?${params.toString()}`) : null
  )

  return {
    pool: data?.pool ?? null,
    totalLpSupplyRaw: data?.total_lp_supply_raw ?? 0,
    totalLpSupply: data?.total_lp_supply ?? 0,
    holders: data?.holders ?? [],
    deposits: data?.deposits ?? [],
    withdrawals: data?.withdrawals ?? [],
    matches: data?.matches ?? [],
    error,
    isLoading,
  }
}

export function usePoolAddressPosition(lpAsset: string | null, address: string | null) {
  const { data, error, isLoading } = useDexSWR<PoolAddressPosition>(
    lpAsset && address
      ? dexUrl(`/pools/${encodeURIComponent(lpAsset)}/addresses/${encodeURIComponent(address)}`)
      : null
  )

  return {
    position: data ?? null,
    error,
    isLoading,
  }
}

export function useAddressPools(address: string | null) {
  const { data, error, isLoading } = useDexSWR<{ address: string; pools: AddressPoolSummary[] }>(
    address ? dexUrl(`/addresses/${encodeURIComponent(address)}/pools`) : null
  )

  return {
    pools: data?.pools ?? [],
    error,
    isLoading,
  }
}

export function usePoolDepositQuote(assetA: string | null, assetB: string | null, quantityRaw: number | null) {
  const enabled = !!assetA && !!assetB && quantityRaw != null && quantityRaw > 0
  const { data, error, isLoading } = useSWR<{ result: PoolDepositQuote }>(
    enabled
      ? counterpartyUrl(`/pools/${encodeURIComponent(assetA!)}/${encodeURIComponent(assetB!)}/quote/deposit?quantity=${quantityRaw}`)
      : null,
    fetcher,
    { refreshInterval: 30_000 },
  )

  return {
    quote: data?.result ?? null,
    error,
    isLoading,
  }
}

export function usePoolWithdrawQuote(assetA: string | null, assetB: string | null, quantityRaw: number | null) {
  const enabled = !!assetA && !!assetB && quantityRaw != null && quantityRaw > 0
  const { data, error, isLoading } = useSWR<{ result: PoolWithdrawQuote }>(
    enabled
      ? counterpartyUrl(`/pools/${encodeURIComponent(assetA!)}/${encodeURIComponent(assetB!)}/quote/withdraw?quantity=${quantityRaw}`)
      : null,
    fetcher,
    { refreshInterval: 30_000 },
  )

  return {
    quote: data?.result ?? null,
    error,
    isLoading,
  }
}
