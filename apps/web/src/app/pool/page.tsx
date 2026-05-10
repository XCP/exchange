'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Pagination } from '@/components/Pagination'
import { CounterCard } from '@/components/home/counter-card'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { useAddressPools, usePools, type AddressPoolSummary, type PoolSortKey, type PoolSummary } from '@/lib/hooks/usePools'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAmount } from '@/utils/format-amount'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

const LIMIT = 50
const SORT_OPTIONS: { value: PoolSortKey; label: string }[] = [
  { value: 'match_count', label: 'Matches' },
  { value: 'implied_fee_apr_30d', label: '30D Implied APR' },
  { value: 'last_block_time', label: 'Recently Updated' },
  { value: 'deposit_count', label: 'Deposits' },
  { value: 'withdrawal_count', label: 'Withdrawals' },
  { value: 'opened_block_time', label: 'Opened' },
]

export default function PoolPage() {
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<PoolSortKey>('match_count')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { pools, total, isLoading, error } = usePools(offset, LIMIT, sort, order)
  const { pools: addressPools, isLoading: addressPoolsLoading, error: addressPoolsError } = useAddressPools(address)
  const [showInstall, setShowInstall] = useState(false)
  const totals = pools.reduce(
    (acc, pool) => {
      acc.matches += pool.match_count
      acc.deposits += pool.deposit_count
      acc.withdrawals += pool.withdrawal_count
      return acc
    },
    { matches: 0, deposits: 0, withdrawals: 0 }
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Pools</h1>
            <p className="text-xs text-zinc-500">AMM liquidity pools indexed from Counterparty events</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as PoolSortKey)
                setOffset(0)
              }}
              className="px-2 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-300 outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>Sort: {option.label}</option>
              ))}
            </select>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value as 'asc' | 'desc')
                setOffset(0)
              }}
              className="px-2 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-300 outline-none"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <CounterCard label="Pools" loading={isLoading} value={total.toLocaleString()} />
          <CounterCard label="Visible Matches" loading={isLoading} value={totals.matches.toLocaleString()} />
          <CounterCard label="Visible Deposits" loading={isLoading} value={totals.deposits.toLocaleString()} />
          <CounterCard label="Visible Withdrawals" loading={isLoading} value={totals.withdrawals.toLocaleString()} />
        </div>

        <AddressPoolsPanel
          pools={addressPools}
          walletStatus={walletStatus}
          address={address}
          loading={addressPoolsLoading}
          error={addressPoolsError}
          connecting={connecting}
          onConnect={async () => {
            if (walletStatus === 'disconnected') {
              await connect()
            } else {
              setShowInstall(true)
            }
          }}
        />
        {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="overflow-x-auto">
            <PoolsTable pools={pools} isLoading={isLoading} error={error} />
          </div>
          <Pagination total={total} offset={offset} limit={LIMIT} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function AddressPoolsPanel({
  pools,
  walletStatus,
  address,
  loading,
  error,
  connecting,
  onConnect,
}: {
  pools: AddressPoolSummary[]
  walletStatus: 'not_detected' | 'disconnected' | 'connected'
  address: string | null
  loading: boolean
  error: unknown
  connecting: boolean
  onConnect: () => void | Promise<void>
}) {
  return (
    <section className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800">
        <div>
          <div className="text-xs font-medium text-zinc-300">Your Pools</div>
          <div className="text-[11px] text-zinc-500 font-mono">{address ? formatAddress(address) : 'Wallet not connected'}</div>
        </div>
        {walletStatus !== 'connected' && (
          <button
            onClick={onConnect}
            disabled={connecting}
            className="rounded-sm bg-green-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>

      {walletStatus !== 'connected' ? (
        <div className="px-3 py-4 text-xs text-zinc-500">Connect to see LP positions held by your wallet.</div>
      ) : error ? (
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
                <th className="text-right font-normal px-3 py-1.5">Implied Fee Share</th>
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

function PoolsTable({ pools, isLoading, error }: { pools: PoolSummary[]; isLoading: boolean; error: unknown }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Pool</th>
          <th className="text-left font-normal px-3 py-1.5">LP Asset</th>
          <th className="text-right font-normal px-3 py-1.5">Base Reserve</th>
          <th className="text-right font-normal px-3 py-1.5">Quote Reserve</th>
          <th className="text-right font-normal px-3 py-1.5">Pool Fees</th>
          <th className="text-right font-normal px-3 py-1.5">30D Pool Fees</th>
          <th className="text-right font-normal px-3 py-1.5">30D Implied APR</th>
          <th className="text-right font-normal px-3 py-1.5">Matches</th>
          <th className="text-right font-normal px-3 py-1.5">Updated</th>
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
              <Link href={`/pool/${pool.lp_asset}`} className="inline-flex items-center gap-2 text-zinc-100 hover:underline">
                <Image src={`${XCP_IMG_BASE}/icon/${pool.display_base_asset ?? pool.asset_a}`} alt="" width={16} height={16} className="rounded-sm" unoptimized />
                <span>{pool.display_base_asset ?? pool.asset_a}</span>
                <span className="text-zinc-600">/</span>
                <Image src={`${XCP_IMG_BASE}/icon/${pool.display_quote_asset ?? pool.asset_b}`} alt="" width={16} height={16} className="rounded-sm" unoptimized />
                <span>{pool.display_quote_asset ?? pool.asset_b}</span>
              </Link>
            </td>
            <td className="px-3 py-1.5 font-mono text-zinc-400">
              <Link href={`/${pool.lp_asset}`} className="hover:underline">{pool.lp_asset}</Link>
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">{formatAmount(pool.display_base_reserve ?? pool.reserve_a)} {pool.display_base_asset ?? pool.asset_a}</td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">{formatAmount(pool.display_quote_reserve ?? pool.reserve_b)} {pool.display_quote_asset ?? pool.asset_b}</td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatPoolFees(pool)}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatPoolFees(pool, '30d')}
            </td>
            <td className="text-right font-mono text-zinc-400 px-3 py-1.5">
              {formatApr(pool.implied_fee_apr_30d)}
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

function formatPoolFees(pool: PoolSummary, window?: '30d') {
  const baseFees = window === '30d'
    ? pool.display_fees_30d_base ?? pool.display_implied_fees_30d_base ?? 0
    : pool.display_base_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  const quoteFees = window === '30d'
    ? pool.display_fees_30d_quote ?? pool.display_implied_fees_30d_quote ?? 0
    : pool.display_quote_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  return `${formatAmount(baseFees)} ${pool.display_base_asset ?? pool.asset_a} / ${formatAmount(quoteFees)} ${pool.display_quote_asset ?? pool.asset_b}`
}

function formatApr(apr: number | null | undefined) {
  if (apr == null || !Number.isFinite(apr)) return '-'
  return `${(apr * 100).toFixed(2)}%`
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(2)}%`
}
