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
  fees_7d_a?: number
  fees_7d_b?: number
  fees_30d_a?: number
  fees_30d_b?: number
  implied_fees_24h_a?: number
  implied_fees_24h_b?: number
  implied_fees_7d_a?: number
  implied_fees_7d_b?: number
  implied_fees_30d_a?: number
  implied_fees_30d_b?: number
  implied_fee_apr_24h?: number | null
  implied_fee_apr_7d?: number | null
  implied_fee_apr_30d?: number | null
  display_fees_24h_base?: number
  display_fees_24h_quote?: number
  display_fees_7d_base?: number
  display_fees_7d_quote?: number
  display_fees_30d_base?: number
  display_fees_30d_quote?: number
  display_implied_fees_24h_base?: number
  display_implied_fees_24h_quote?: number
  display_implied_fees_7d_base?: number
  display_implied_fees_7d_quote?: number
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

export interface PoolAssetInfo {
  asset: string
  divisible: boolean
  supply: number
  supply_normalized: string
}

interface CounterpartyAssetResponse {
  result: PoolAssetInfo
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
  limit: number
  offset: number
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
  | 'implied_fee_apr_30d'

export function usePools(
  offset = 0,
  limit = 50,
  sort: PoolSortKey = 'match_count',
  order: 'asc' | 'desc' = 'desc'
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort,
    order,
  })

  const { data, error, isLoading } = useDexSWR<PoolsResponse>(
    dexUrl(`/pools?${params.toString()}`)
  )

  return {
    pools: data?.pools ?? [],
    total: data?.total ?? 0,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    error,
    isLoading,
  }
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

export function usePoolAssetInfo(asset: string | null) {
  const { data, error, isLoading } = useSWR<CounterpartyAssetResponse>(
    asset ? counterpartyUrl(`/assets/${encodeURIComponent(asset)}?verbose=true`) : null,
    fetcher,
  )

  return {
    info: data?.result ?? null,
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
