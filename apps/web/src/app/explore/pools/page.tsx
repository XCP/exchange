'use client'

import { Suspense, useCallback, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Pagination } from '@/components/Pagination'
import { CounterCard } from '@/components/home/counter-card'
import { useTimeframeParam } from '@/lib/hooks/useTimeframeParam'
import { BrowseHeader, HideLowQualityToggle, StatGrid, TimeframePills, TIMEFRAME_LABELS } from '@/components/browse-controls'
import { YourSection, CreateAction } from '@/components/your-section'
import type { Timeframe } from '@/lib/hooks/useAnalytics'
import { useAddressPools, usePools, type AddressPoolSummary, type PoolSortKey, type PoolStatusFilter, type PoolSummary } from '@/lib/hooks/usePools'
import { useTags } from '@/lib/hooks/useTags'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'
import { poolFeeLabel } from '@/utils/pool-fee'

const LIMIT = 50
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
  const [timeframe, setTimeframe] = useTimeframeParam()
  const [poolStatus, setPoolStatus] = useState<PoolStatusFilter>('active')
  const [hideLowQuality, setHideLowQuality] = useState(true)
  const [sortColumn, setSortColumn] = useState<PoolSortColumn>('volume')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [tag, setTag] = useState<string | null>(() => searchParams.get('v'))
  const { address } = useWallet()
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
        <BrowseHeader title="AMM Pools" subtitle="AMM liquidity pools indexed from Counterparty events">
          <CreateAction href="/liquidity/deposit" label="+ Add liquidity" />
          <HideLowQualityToggle
            checked={hideLowQuality}
            onChange={(checked) => {
              setHideLowQuality(checked)
              setOffset(0)
            }}
          />
          <TimeframePills
            value={timeframe}
            onChange={(value) => {
              setTimeframe(value)
              // APY is meaningless over "all time", so fall back to a sort
              // that still means something in that window.
              if (value === 'all' && sortColumn === 'apy') setSortColumn('trades')
              setOffset(0)
            }}
          />
        </BrowseHeader>

        <StatGrid>
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
        </StatGrid>

        {/* Rendered whether or not a wallet is connected: the section offers
            the connect button, so the answer to "where are my pools" is on the
            page rather than somewhere the reader has to already know about. */}
        <AddressPoolsPanel
          pools={addressPools}
          loading={addressPoolsLoading}
          error={addressPoolsError}
        />

        <div className="rounded-sm border border-zinc-800 bg-zinc-900/50">
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
  loading,
  error,
}: {
  pools: AddressPoolSummary[]
  loading: boolean
  error: unknown
}) {
  return (
    <YourSection
      title="Your Pools"
      noun="pools"
      loading={loading}
      error={error}
      isEmpty={pools.length === 0}
      emptyLabel="No LP positions for this wallet."
    >
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-normal">Pool</th>
                <th className="px-3 py-2 text-right font-normal">LP Balance</th>
                <th className="px-3 py-2 text-right font-normal">Share</th>
                <th className="px-3 py-2 text-right font-normal">Fee Share</th>
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
    </YourSection>
  )
}

function getPoolSortKey(sortColumn: PoolSortColumn, timeframe: Timeframe): PoolSortKey {
  if (sortColumn === 'last') return 'last_block_time'
  if (sortColumn === 'volume') {
    if (timeframe === '24h') return 'volume_24h_value'
    if (timeframe === '1y') return 'volume_1y_value'
    if (timeframe === '30d') return 'volume_30d_value'
    return 'total_volume_value'
  }
  if (sortColumn === 'fees') {
    if (timeframe === '24h') return 'fees_24h_value'
    if (timeframe === '1y') return 'fees_1y_value'
    if (timeframe === '30d') return 'fees_30d_value'
    return 'total_fees_value'
  }
  if (sortColumn === 'apy') {
    if (timeframe === '24h') return 'implied_fee_apy_24h'
    if (timeframe === '1y') return 'implied_fee_apy_1y'
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
  timeframe: Timeframe
  sortColumn: PoolSortColumn
  sortOrder: 'asc' | 'desc'
  onSort: (column: PoolSortColumn) => void
}) {
  const feeLabel = timeframe === 'all' ? 'Fees' : `Fees (${TIMEFRAME_LABELS[timeframe]})`
  const volumeLabel = timeframe === 'all' ? 'Volume' : `Volume (${TIMEFRAME_LABELS[timeframe]})`
  const apyLabel = timeframe === 'all' ? 'Fee APY' : `Fee APY (${TIMEFRAME_LABELS[timeframe]})`
  return (
    <table className="w-full whitespace-nowrap text-xs">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500">
          <th className="px-3 py-2 text-left font-normal">Asset A</th>
          <th className="px-3 py-2 text-left font-normal">Asset B</th>
          <th className="px-3 py-2 text-right font-normal">Fee Tier</th>
          <th className="px-3 py-2 text-right font-normal">Price</th>
          <th className="px-3 py-2 text-right font-normal">Liquidity</th>
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

function formatPoolVolume(pool: PoolSummary, timeframe: Timeframe) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const baseVolume = timeframe === '24h'
    ? pool.display_volume_24h_base ?? 0
    : timeframe === '1y'
      ? pool.display_volume_1y_base ?? 0
      : timeframe === '30d'
        ? pool.display_volume_30d_base ?? 0
        : pool.display_volume_base ?? 0
  const quoteVolume = timeframe === '24h'
    ? pool.display_volume_24h_quote ?? 0
    : timeframe === '1y'
      ? pool.display_volume_1y_quote ?? 0
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

function formatPoolFees(pool: PoolSummary, timeframe: Timeframe) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const baseFees = timeframe === '24h'
    ? pool.display_fees_24h_base ?? pool.display_implied_fees_24h_base ?? 0
    : timeframe === '1y'
      ? pool.display_fees_1y_base ?? pool.display_implied_fees_1y_base ?? 0
      : timeframe === '30d'
        ? pool.display_fees_30d_base ?? pool.display_implied_fees_30d_base ?? 0
        : pool.display_base_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  const quoteFees = timeframe === '24h'
    ? pool.display_fees_24h_quote ?? pool.display_implied_fees_24h_quote ?? 0
    : timeframe === '1y'
      ? pool.display_fees_1y_quote ?? pool.display_implied_fees_1y_quote ?? 0
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

function getPoolApy(pool: PoolSummary, timeframe: Timeframe) {
  if (timeframe === 'all') return null
  if (timeframe === '24h') return pool.implied_fee_apy_24h
  if (timeframe === '1y') return pool.implied_fee_apy_1y
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
  return poolFeeLabel(pool.asset_a, pool.asset_b)
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
