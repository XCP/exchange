'use client'

import { Suspense, useCallback, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Pagination } from '@/components/Pagination'
import { CounterCard } from '@/components/home/counter-card'
import { TogglePills } from '@/components/home/toggle-pills'
import { useAddressPools, usePools, type AddressPoolSummary, type PoolSortKey, type PoolStatusFilter, type PoolSummary } from '@/lib/hooks/usePools'
import { useTags } from '@/lib/hooks/useTags'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAmount } from '@/utils/format-amount'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

const LIMIT = 50
const TF_OPTIONS = ['24h', '7d', '30d', 'all'] as const
type PoolTimeframe = (typeof TF_OPTIONS)[number]
const TF_LABELS: Record<PoolTimeframe, string> = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All' }
type PoolSortColumn = 'volume' | 'fees' | 'apy' | 'trades' | 'last'
const STATUS_TABS: [PoolStatusFilter, string][] = [
  ['all', 'All'],
  ['active', 'Active'],
  ['inactive', 'Inactive'],
]

export default function PoolPage() {
  return <Suspense><PoolPageInner /></Suspense>
}

function PoolPageInner() {
  const searchParams = useSearchParams()
  const [offset, setOffset] = useState(0)
  const [timeframe, setTimeframe] = useState<PoolTimeframe>('all')
  const [poolStatus, setPoolStatus] = useState<PoolStatusFilter>('active')
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [sortColumn, setSortColumn] = useState<PoolSortColumn>('volume')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [tag, setTag] = useState<string | null>(() => searchParams.get('v'))
  const { status: walletStatus, address } = useWallet()
  const collections = useTags('collection')
  const apiSort = getPoolSortKey(sortColumn, timeframe)
  const { pools, total, summary, isLoading, error } = usePools(offset, LIMIT, apiSort, sortOrder, {
    status: poolStatus,
    includeHidden: !hideLowQuality,
    tag,
    timeframe,
  })
  const { pools: addressPools, isLoading: addressPoolsLoading, error: addressPoolsError } = useAddressPools(address)
  const lpActivity = summary.tf_deposits + summary.tf_withdrawals
  const nonXcpPoolCount = Math.max(0, summary.total_pools - summary.xcp_pool_count)
  const xcpTradeCount = Math.max(0, summary.tf_trades - summary.tf_non_xcp_trades)
  const handleTagChange = useCallback((slug: string | null) => {
    setTag(slug)
    setOffset(0)
    const url = new URL(window.location.href)
    if (slug) url.searchParams.set('v', slug)
    else url.searchParams.delete('v')
    window.history.replaceState(null, '', url.toString())
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Pools</h1>
            <p className="text-xs text-zinc-500">AMM liquidity pools indexed from Counterparty events</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideLowQuality}
                onChange={(e) => {
                  setHideLowQuality(e.target.checked)
                  setOffset(0)
                }}
                className="accent-zinc-500 w-3 h-3"
              />
              <span className="text-xs text-zinc-500">Hide low quality</span>
            </label>
            <TogglePills
              options={TF_OPTIONS}
              value={timeframe}
              onChange={(value) => {
                setTimeframe(value)
                if (value === 'all' && sortColumn === 'apy') setSortColumn('trades')
                setOffset(0)
              }}
              label={(tf) => TF_LABELS[tf]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <CounterCard
            key="pool-liquidity"
            label="Liquidity"
            loading={isLoading}
            value={`${formatAmount(summary.xcp_liquidity)} XCP`}
            sub={`${summary.xcp_pool_count.toLocaleString()} XCP pools / ${formatOtherCount(nonXcpPoolCount)}`}
          />
          <CounterCard
            key="pool-trade-volume"
            label="Trade Volume"
            loading={isLoading}
            value={`${formatAmount(summary.tf_volume_xcp)} XCP`}
            sub={`${xcpTradeCount.toLocaleString()} XCP trades / ${formatOtherCount(summary.tf_non_xcp_trades)}`}
          />
          <CounterCard
            label="LP Activity"
            loading={isLoading}
            value={`${lpActivity.toLocaleString()} txs`}
            sub={`${summary.tf_deposits.toLocaleString()} deposits / ${summary.tf_withdrawals.toLocaleString()} withdrawals`}
          />
          <CounterCard
            label="Active Pools"
            loading={isLoading}
            value={summary.tf_active_pools.toLocaleString()}
            sub={timeframe === 'all' ? `${summary.total_pools.toLocaleString()} total` : `${summary.new_pools.toLocaleString()} new`}
          />
        </div>

        {walletStatus === 'connected' && (
          <AddressPoolsPanel
            pools={addressPools}
            address={address}
            loading={addressPoolsLoading}
            error={addressPoolsError}
          />
        )}

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="sm:hidden px-3 py-2">
            <div className="flex gap-2">
              <select
                value={tag ?? ''}
                onChange={(e) => handleTagChange(e.target.value || null)}
                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
              >
                <option value="">All Pools</option>
                {collections.map((collection) => (
                  <option key={collection.slug} value={collection.slug}>{collection.name}</option>
                ))}
              </select>
              <select
                value={poolStatus}
                onChange={(e) => {
                  setPoolStatus(e.target.value as PoolStatusFilter)
                  setOffset(0)
                }}
                className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
              >
                {STATUS_TABS.map(([key, label]) => (
                  <option key={key} value={key}>{label} Pools</option>
                ))}
              </select>
            </div>
          </div>
          <div className="hidden sm:flex px-3 py-2 items-center gap-2">
            <select
              value={tag ?? ''}
              onChange={(e) => handleTagChange(e.target.value || null)}
              className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded-sm text-zinc-300 outline-none"
            >
              <option value="">All Pools</option>
              {collections.map((collection) => (
                <option key={collection.slug} value={collection.slug}>{collection.name}</option>
              ))}
            </select>
            <div className="flex gap-0.5 ml-auto">
              {STATUS_TABS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    setPoolStatus(key)
                    setOffset(0)
                  }}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                    poolStatus === key
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <PoolsTable
              pools={pools}
              isLoading={isLoading}
              error={error}
              timeframe={timeframe}
              sortColumn={sortColumn}
              sortOrder={sortOrder}
              onSort={(column) => {
                if (column === 'apy' && timeframe === 'all') return
                if (sortColumn === column) {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                } else {
                  setSortColumn(column)
                  setSortOrder('desc')
                }
                setOffset(0)
              }}
            />
          </div>
          <Pagination total={total} offset={offset} limit={LIMIT} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function AddressPoolsPanel({
  pools,
  address,
  loading,
  error,
}: {
  pools: AddressPoolSummary[]
  address: string | null
  loading: boolean
  error: unknown
}) {
  return (
    <section className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800">
        <div>
          <div className="text-xs font-medium text-zinc-300">Your Pools</div>
          <div className="text-[11px] text-zinc-500 font-mono">{address ? formatAddress(address) : 'Wallet not connected'}</div>
        </div>
      </div>

      {error ? (
        <div className="px-3 py-4 text-xs text-zinc-500">Could not load your pools.</div>
      ) : loading ? (
        <div className="px-3 py-4 text-xs text-zinc-500">Loading your pools...</div>
      ) : pools.length === 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500">No LP positions found for this wallet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-normal px-3 py-1.5">Pool</th>
                <th className="text-right font-normal px-3 py-1.5">LP Balance</th>
                <th className="text-right font-normal px-3 py-1.5">Share</th>
                <th className="text-right font-normal px-3 py-1.5">Fee Share</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => {
                const baseAsset = pool.display_base_asset ?? pool.asset_a
                const quoteAsset = pool.display_quote_asset ?? pool.asset_b
                const baseFees = baseAsset === pool.asset_a ? pool.implied_fees_a : pool.implied_fees_b
                const quoteFees = quoteAsset === pool.asset_a ? pool.implied_fees_a : pool.implied_fees_b
                const ownership = pool.total_lp_supply_raw > 0 ? pool.balance_raw / pool.total_lp_supply_raw : 0

                return (
                  <tr key={pool.lp_asset} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                    <td className="px-3 py-1.5">
                      <Link href={`/pool/${pool.lp_asset}`} className="text-zinc-100 hover:underline">
                        {pool.display_pair ?? `${pool.asset_a}/${pool.asset_b}`}
                      </Link>
                      <span className="ml-2 text-zinc-600 font-mono">{pool.lp_asset}</span>
                    </td>
                    <td className="text-right font-mono text-zinc-400 px-3 py-1.5">{formatAmount(pool.balance)}</td>
                    <td className="text-right font-mono text-zinc-500 px-3 py-1.5">{formatPct(ownership)}</td>
                    <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
                      {formatAmount(baseFees)} {baseAsset} / {formatAmount(quoteFees)} {quoteAsset}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function getPoolSortKey(sortColumn: PoolSortColumn, timeframe: PoolTimeframe): PoolSortKey {
  if (sortColumn === 'last') return 'last_block_time'
  if (sortColumn === 'volume') {
    if (timeframe === '24h') return 'volume_24h_value'
    if (timeframe === '7d') return 'volume_7d_value'
    if (timeframe === '30d') return 'volume_30d_value'
    return 'total_volume_value'
  }
  if (sortColumn === 'fees') {
    if (timeframe === '24h') return 'fees_24h_value'
    if (timeframe === '7d') return 'fees_7d_value'
    if (timeframe === '30d') return 'fees_30d_value'
    return 'total_fees_value'
  }
  if (sortColumn === 'apy') {
    if (timeframe === '24h') return 'implied_fee_apy_24h'
    if (timeframe === '7d') return 'implied_fee_apy_7d'
    if (timeframe === '30d') return 'implied_fee_apy_30d'
  }
  return 'match_count'
}

function PoolsTable({
  pools,
  isLoading,
  error,
  timeframe,
  sortColumn,
  sortOrder,
  onSort,
}: {
  pools: PoolSummary[]
  isLoading: boolean
  error: unknown
  timeframe: PoolTimeframe
  sortColumn: PoolSortColumn
  sortOrder: 'asc' | 'desc'
  onSort: (column: PoolSortColumn) => void
}) {
  const feeLabel = timeframe === 'all' ? 'Fees' : `Fees (${TF_LABELS[timeframe]})`
  const volumeLabel = timeframe === 'all' ? 'Volume' : `Volume (${TF_LABELS[timeframe]})`
  const apyLabel = timeframe === 'all' ? 'Fee APY' : `Fee APY (${TF_LABELS[timeframe]})`
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Asset A</th>
          <th className="text-left font-normal px-3 py-1.5">Asset B</th>
          <th className="text-right font-normal px-3 py-1.5">Fee Tier</th>
          <th className="text-right font-normal px-3 py-1.5">Price</th>
          <th className="text-right font-normal px-3 py-1.5">Liquidity</th>
          <PoolSortHeader label={volumeLabel} column="volume" activeColumn={sortColumn} order={sortOrder} onSort={onSort} />
          <PoolSortHeader label={feeLabel} column="fees" activeColumn={sortColumn} order={sortOrder} onSort={onSort} />
          <PoolSortHeader label={apyLabel} column="apy" activeColumn={sortColumn} order={sortOrder} onSort={onSort} disabled={timeframe === 'all'} />
          <PoolSortHeader label="Trades" column="trades" activeColumn={sortColumn} order={sortOrder} onSort={onSort} />
          <PoolSortHeader label="Last Activity" column="last" activeColumn={sortColumn} order={sortOrder} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {error || isLoading || pools.length === 0 ? (
          <tr>
            <td colSpan={9} className="text-center py-10 text-zinc-500 text-xs">
              {error ? 'Could not load pools' : isLoading ? 'Loading pools...' : 'No pools indexed yet'}
            </td>
          </tr>
        ) : pools.map((pool) => (
          <tr key={pool.lp_asset} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
            <td className="px-3 py-1.5">
              <Link href={`/pool/${pool.lp_asset}`} className="inline-flex items-center gap-1.5 text-zinc-100 hover:underline">
                <Image src={`${XCP_IMG_BASE}/icon/${pool.display_base_asset ?? pool.asset_a}`} alt="" width={16} height={16} className="rounded-sm" unoptimized />
                <span>{pool.display_base_asset ?? pool.asset_a}</span>
              </Link>
            </td>
            <td className="px-3 py-1.5">
              <Link href={`/pool/${pool.lp_asset}`} className="inline-flex items-center gap-1.5 text-zinc-400 hover:underline">
                <Image src={`${XCP_IMG_BASE}/icon/${pool.display_quote_asset ?? pool.asset_b}`} alt="" width={16} height={16} className="rounded-sm" unoptimized />
                <span>{pool.display_quote_asset ?? pool.asset_b}</span>
              </Link>
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatPoolFeeTier(pool)}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatPoolPrice(pool)}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatAmount(pool.display_base_reserve ?? pool.reserve_a)} {pool.display_base_asset ?? pool.asset_a}
              <div className="text-zinc-500">{formatAmount(pool.display_quote_reserve ?? pool.reserve_b)} {pool.display_quote_asset ?? pool.asset_b}</div>
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatPoolVolume(pool, timeframe)}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatPoolFees(pool, timeframe)}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatApy(getPoolApy(pool, timeframe))}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">{pool.match_count.toLocaleString()}</td>
            <td className="text-right font-mono text-zinc-500 px-3 py-1.5">
              {pool.last_block_time ? formatTimeAgo(pool.last_block_time) : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PoolSortHeader({
  label,
  column,
  activeColumn,
  order,
  onSort,
  disabled,
}: {
  label: string
  column: PoolSortColumn
  activeColumn: PoolSortColumn
  order: 'asc' | 'desc'
  onSort: (column: PoolSortColumn) => void
  disabled?: boolean
}) {
  const isActive = !disabled && activeColumn === column
  const arrow = isActive ? (order === 'desc' ? ' ↓' : ' ↑') : ''
  return (
    <th
      className={`text-right font-normal px-3 py-1.5 select-none transition-colors ${
        disabled ? 'text-zinc-700' : `cursor-pointer hover:text-zinc-300 ${isActive ? 'text-zinc-300' : ''}`
      }`}
      onClick={disabled ? undefined : () => onSort(column)}
    >
      {label}{arrow}
    </th>
  )
}

function formatPoolVolume(pool: PoolSummary, timeframe: PoolTimeframe) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const baseVolume = timeframe === '24h'
    ? pool.display_volume_24h_base ?? 0
    : timeframe === '7d'
      ? pool.display_volume_7d_base ?? 0
      : timeframe === '30d'
        ? pool.display_volume_30d_base ?? 0
        : pool.display_volume_base ?? 0
  const quoteVolume = timeframe === '24h'
    ? pool.display_volume_24h_quote ?? 0
    : timeframe === '7d'
      ? pool.display_volume_7d_quote ?? 0
      : timeframe === '30d'
        ? pool.display_volume_30d_quote ?? 0
        : pool.display_volume_quote ?? 0
  return (
    <>
      {formatAmount(baseVolume)} {baseAsset}
      <div className="text-zinc-500">{formatAmount(quoteVolume)} {quoteAsset}</div>
    </>
  )
}

function formatPoolFees(pool: PoolSummary, timeframe: PoolTimeframe) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const baseFees = timeframe === '24h'
    ? pool.display_fees_24h_base ?? pool.display_implied_fees_24h_base ?? 0
    : timeframe === '7d'
      ? pool.display_fees_7d_base ?? pool.display_implied_fees_7d_base ?? 0
      : timeframe === '30d'
        ? pool.display_fees_30d_base ?? pool.display_implied_fees_30d_base ?? 0
        : pool.display_base_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  const quoteFees = timeframe === '24h'
    ? pool.display_fees_24h_quote ?? pool.display_implied_fees_24h_quote ?? 0
    : timeframe === '7d'
      ? pool.display_fees_7d_quote ?? pool.display_implied_fees_7d_quote ?? 0
      : timeframe === '30d'
        ? pool.display_fees_30d_quote ?? pool.display_implied_fees_30d_quote ?? 0
        : pool.display_quote_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  return (
    <>
      {formatAmount(baseFees)} {baseAsset}
      <div className="text-zinc-500">{formatAmount(quoteFees)} {quoteAsset}</div>
    </>
  )
}

function getPoolApy(pool: PoolSummary, timeframe: PoolTimeframe) {
  if (timeframe === 'all') return null
  if (timeframe === '24h') return pool.implied_fee_apy_24h
  if (timeframe === '7d') return pool.implied_fee_apy_7d
  return pool.implied_fee_apy_30d
}

function formatApy(apy: number | null | undefined) {
  if (apy == null || !Number.isFinite(apy)) return 'N/A'
  return `${(apy * 100).toFixed(2)}%`
}

function formatPoolPrice(pool: PoolSummary) {
  const price = pool.display_price ?? calculatePoolPrice(pool)
  if (price == null || !Number.isFinite(price) || price <= 0) return '-'
  return `${formatAmount(price)} ${pool.display_quote_asset ?? pool.asset_b}`
}

function formatPoolFeeTier(pool: PoolSummary) {
  return pool.asset_a === 'XCP' || pool.asset_b === 'XCP' ? '0.5%' : '1.0%'
}

function calculatePoolPrice(pool: PoolSummary) {
  const baseReserve = pool.display_base_reserve ?? pool.reserve_a
  const quoteReserve = pool.display_quote_reserve ?? pool.reserve_b
  if (baseReserve <= 0 || quoteReserve <= 0) return null
  return quoteReserve / baseReserve
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(2)}%`
}

function formatOtherCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? 'other' : 'others'}`
}
