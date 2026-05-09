'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Pagination } from '@/components/Pagination'
import { CounterCard } from '@/components/home/counter-card'
import { usePools, type PoolSummary } from '@/lib/hooks/usePools'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

const LIMIT = 50

export default function PoolPage() {
  const [offset, setOffset] = useState(0)
  const { pools, total, isLoading } = usePools(offset, LIMIT)
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
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <CounterCard label="Pools" loading={isLoading} value={total.toLocaleString()} />
          <CounterCard label="Visible Matches" loading={isLoading} value={totals.matches.toLocaleString()} />
          <CounterCard label="Visible Deposits" loading={isLoading} value={totals.deposits.toLocaleString()} />
          <CounterCard label="Visible Withdrawals" loading={isLoading} value={totals.withdrawals.toLocaleString()} />
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
          <div className="overflow-x-auto">
            <PoolsTable pools={pools} isLoading={isLoading} />
          </div>
          <Pagination total={total} offset={offset} limit={LIMIT} onOffsetChange={setOffset} />
        </div>
      </div>
    </div>
  )
}

function PoolsTable({ pools, isLoading }: { pools: PoolSummary[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Pool</th>
          <th className="text-left font-normal px-3 py-1.5">LP Asset</th>
          <th className="text-right font-normal px-3 py-1.5">Base Reserve</th>
          <th className="text-right font-normal px-3 py-1.5">Quote Reserve</th>
          <th className="text-right font-normal px-3 py-1.5">Fees</th>
          <th className="text-right font-normal px-3 py-1.5">30D Fees</th>
          <th className="text-right font-normal px-3 py-1.5">30D APR</th>
          <th className="text-right font-normal px-3 py-1.5">Matches</th>
          <th className="text-right font-normal px-3 py-1.5">Updated</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || pools.length === 0 ? (
          <tr>
            <td colSpan={9} className="text-center py-10 text-zinc-500 text-xs">
              {isLoading ? 'Loading pools...' : 'No pools indexed yet'}
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
    ? pool.display_implied_fees_30d_base ?? 0
    : pool.display_base_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  const quoteFees = window === '30d'
    ? pool.display_implied_fees_30d_quote ?? 0
    : pool.display_quote_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  return `${formatAmount(baseFees)} ${pool.display_base_asset ?? pool.asset_a} / ${formatAmount(quoteFees)} ${pool.display_quote_asset ?? pool.asset_b}`
}

function formatApr(apr: number | null | undefined) {
  if (apr == null || !Number.isFinite(apr)) return '-'
  return `${(apr * 100).toFixed(2)}%`
}
