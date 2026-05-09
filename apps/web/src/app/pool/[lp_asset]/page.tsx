'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { CounterCard } from '@/components/home/counter-card'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { usePool, usePoolAddressPosition, type PoolAddressPosition, type PoolDeposit, type PoolDisplayAmounts, type PoolHolder, type PoolMatch, type PoolSummary, type PoolWithdrawal } from '@/lib/hooks/usePools'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

export default function PoolDetailPage() {
  const params = useParams<{ lp_asset: string }>()
  const lpAsset = decodeURIComponent(params.lp_asset ?? '').toUpperCase()
  const { pool, totalLpSupplyRaw, holders, deposits, withdrawals, matches, isLoading } = usePool(lpAsset)
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { position, isLoading: positionLoading } = usePoolAddressPosition(lpAsset, address)
  const [showInstall, setShowInstall] = useState(false)
  const displayBase = pool?.display_base_asset ?? pool?.asset_a
  const displayQuote = pool?.display_quote_asset ?? pool?.asset_b
  const tradePair = displayBase && displayQuote ? `${displayBase}_${displayQuote}` : pool?.pair

  if (!isLoading && !pool) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Pool not found.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>

        <div className="flex items-start justify-between gap-4 mt-4 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {pool && (
                <>
                  <Image src={`${XCP_IMG_BASE}/icon/${displayBase}`} alt="" width={24} height={24} className="rounded-sm" unoptimized />
                  <Image src={`${XCP_IMG_BASE}/icon/${displayQuote}`} alt="" width={24} height={24} className="rounded-sm" unoptimized />
                </>
              )}
              <h1 className="text-lg font-semibold text-zinc-100">{pool ? pool.display_pair ?? `${pool.asset_a}/${pool.asset_b}` : lpAsset}</h1>
            </div>
            <p className="text-xs text-zinc-500 font-mono">LP {lpAsset}</p>
          </div>
          {pool && (
            <div className="flex items-center gap-2">
              <Link href={`/trade/${tradePair}`} className="px-2 py-1 text-xs rounded-sm border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors">
                Trade Pair
              </Link>
              <Link href={`/${pool.lp_asset}`} className="px-2 py-1 text-xs rounded-sm border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors">
                LP Asset
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <CounterCard label="Base Reserve" loading={isLoading} value={pool ? formatAmount(pool.display_base_reserve ?? pool.reserve_a) : '-'} sub={displayBase} />
          <CounterCard label="Quote Reserve" loading={isLoading} value={pool ? formatAmount(pool.display_quote_reserve ?? pool.reserve_b) : '-'} sub={displayQuote} />
          <CounterCard label="Pool Matches" loading={isLoading} value={pool ? pool.match_count.toLocaleString() : '-'} />
          <CounterCard label="Implied Fees" loading={isLoading} value={pool ? formatDisplayFees(pool) : '-'} sub={displayBase && displayQuote ? `${displayBase} / ${displayQuote}` : undefined} />
          <CounterCard label="30D Pool-Implied APR" loading={isLoading} value={pool ? formatApr(pool.implied_fee_apr_30d) : '-'} />
        </div>

        {pool && pool.restart_count > 0 && (
          <div className="mb-6 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 rounded-sm">
            This pool has restarted after LP supply reached zero. Earlier reserves may affect position deltas.
          </div>
        )}

        {pool && (
          <YourPositionPanel
            pool={pool}
            position={position}
            loading={positionLoading}
            walletStatus={walletStatus}
            address={address}
            connecting={connecting}
            onConnect={async () => {
              if (walletStatus === 'disconnected') {
                await connect()
              } else {
                setShowInstall(true)
              }
            }}
          />
        )}
        {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ActivityPanel title="LP Holders">
            <PoolHoldersTable holders={holders} pool={pool} totalLpSupplyRaw={totalLpSupplyRaw} loading={isLoading} />
          </ActivityPanel>
          <ActivityPanel title="Pool Matches">
            <MatchesTable matches={matches} loading={isLoading} />
          </ActivityPanel>
          <ActivityPanel title="Deposits">
            <DepositsTable deposits={deposits} pool={pool} loading={isLoading} />
          </ActivityPanel>
          <ActivityPanel title="Withdrawals">
            <WithdrawalsTable withdrawals={withdrawals} pool={pool} loading={isLoading} />
          </ActivityPanel>
        </div>
      </div>
    </div>
  )
}

function formatApr(apr: number | null | undefined) {
  if (apr == null || !Number.isFinite(apr)) return '-'
  return `${(apr * 100).toFixed(2)}%`
}

function formatDisplayFees(pool: PoolSummary) {
  const baseFees = pool.display_base_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  const quoteFees = pool.display_quote_asset === pool.asset_a ? pool.total_fees_a : pool.total_fees_b
  return `${formatAmount(baseFees)} / ${formatAmount(quoteFees)}`
}

function formatPct(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(decimals)}%`
}

function formatSignedAmount(value: number, asset: string) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatAmount(value)} ${asset}`
}

function formatDisplayAmounts(amounts: PoolDisplayAmounts) {
  return `${formatAmount(amounts.base_quantity)} ${amounts.base_asset} / ${formatAmount(amounts.quote_quantity)} ${amounts.quote_asset}`
}

function caveatLabel(caveat: string) {
  if (caveat === 'lp_balance_changed_outside_pool_deposit_withdraw') {
    return 'LP balance changed outside direct deposits or withdrawals.'
  }
  if (caveat === 'pool_restarted') {
    return 'Pool restart can make deposit-basis comparisons less precise.'
  }
  return caveat
}

function YourPositionPanel({
  pool,
  position,
  loading,
  walletStatus,
  address,
  connecting,
  onConnect,
}: {
  pool: PoolSummary
  position: PoolAddressPosition | null
  loading: boolean
  walletStatus: 'not_detected' | 'disconnected' | 'connected'
  address: string | null
  connecting: boolean
  onConnect: () => void | Promise<void>
}) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const feeA = position?.fees.find((fee) => fee.fee_asset === pool.asset_a)?.fee_quantity ?? 0
  const feeB = position?.fees.find((fee) => fee.fee_asset === pool.asset_b)?.fee_quantity ?? 0
  const baseFees = baseAsset === pool.asset_a ? feeA : feeB
  const quoteFees = quoteAsset === pool.asset_a ? feeA : feeB

  return (
    <section className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800">
        <div>
          <div className="text-xs font-medium text-zinc-300">Your Position</div>
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
        <div className="px-3 py-4 text-xs text-zinc-500">Connect to see your LP balance, reserve claim, and deposit-basis estimate.</div>
      ) : loading ? (
        <div className="px-3 py-4 text-xs text-zinc-500">Loading position...</div>
      ) : !position || position.balance.balance_raw <= 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500">No LP position found for this wallet.</div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <PositionMetric label="LP Balance" value={formatAmount(position.balance.balance)} />
            <PositionMetric label="Pool Share" value={formatPct(position.ownership)} />
            <PositionMetric label="Current Claim" value={formatDisplayAmounts(position.display_claim)} />
            <PositionMetric label="Implied Fees" value={`${formatAmount(baseFees)} ${baseAsset} / ${formatAmount(quoteFees)} ${quoteAsset}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border border-zinc-800 rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-600 mb-1">Net Deposited</div>
              <div className="text-xs text-zinc-300 font-mono">{formatDisplayAmounts(position.display_net_deposited)}</div>
            </div>
            <div className="border border-zinc-800 rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-600 mb-1">Claim vs Deposits</div>
              <div className="text-xs text-zinc-300 font-mono">
                {formatSignedAmount(position.display_claim_vs_deposits.base_quantity, position.display_claim_vs_deposits.base_asset)}
                <span className="text-zinc-600"> / </span>
                {formatSignedAmount(position.display_claim_vs_deposits.quote_quantity, position.display_claim_vs_deposits.quote_asset)}
              </div>
              <div className="mt-1 text-[11px] text-zinc-600">
                Deposit-basis estimate, not realized PnL.
              </div>
            </div>
          </div>

          {position.position_basis.caveats.length > 0 && (
            <div className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 rounded-sm space-y-1">
              {position.position_basis.caveats.map((caveat) => (
                <div key={caveat}>{caveatLabel(caveat)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function PositionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-sm p-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-600 mb-1">{label}</div>
      <div className="text-xs text-zinc-300 font-mono break-words">{value}</div>
    </div>
  )
}

function formatPoolAmounts(pool: PoolSummary | null, quantityA: number, quantityB: number) {
  if (!pool) return `${formatAmount(quantityA)} / ${formatAmount(quantityB)}`
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const baseQuantity = baseAsset === pool.asset_a ? quantityA : quantityB
  const quoteQuantity = quoteAsset === pool.asset_a ? quantityA : quantityB
  return `${formatAmount(baseQuantity)} ${baseAsset} / ${formatAmount(quoteQuantity)} ${quoteAsset}`
}

function PoolHoldersTable({
  holders,
  pool,
  totalLpSupplyRaw,
  loading,
}: {
  holders: PoolHolder[]
  pool: PoolSummary | null
  totalLpSupplyRaw: number
  loading: boolean
}) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Address</th>
          <th className="text-right font-normal px-3 py-1.5">LP Balance</th>
          <th className="text-right font-normal px-3 py-1.5">Share</th>
          <th className="text-right font-normal px-3 py-1.5">Claim</th>
        </tr>
      </thead>
      <tbody>
        {loading || holders.length === 0 || !pool ? (
          <EmptyRow cols={4} loading={loading} label="holders" />
        ) : holders.map((holder) => {
          const ownership = totalLpSupplyRaw > 0 ? holder.balance_raw / totalLpSupplyRaw : 0
          const claimBase = (pool.display_base_reserve ?? pool.reserve_a) * ownership
          const claimQuote = (pool.display_quote_reserve ?? pool.reserve_b) * ownership
          const baseAsset = pool.display_base_asset ?? pool.asset_a
          const quoteAsset = pool.display_quote_asset ?? pool.asset_b

          return (
            <tr key={holder.holder} className="border-b border-zinc-800/30 last:border-0">
              <td className="px-3 py-1.5 text-zinc-500 font-mono">
                {holder.holder_type === 'utxo' ? `${formatAddress(holder.owner_address ?? holder.address)} UTXO` : holder.address}
              </td>
              <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{formatAmount(holder.balance)}</td>
              <td className="px-3 py-1.5 text-right text-zinc-500 font-mono">{(ownership * 100).toFixed(2)}%</td>
              <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">
                {formatAmount(claimBase)} {baseAsset} / {formatAmount(claimQuote)} {quoteAsset}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ActivityPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-300">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function MatchesTable({ matches, loading }: { matches: PoolMatch[]; loading: boolean }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Time</th>
          <th className="text-left font-normal px-3 py-1.5">Address</th>
          <th className="text-right font-normal px-3 py-1.5">Paid</th>
          <th className="text-right font-normal px-3 py-1.5">Received</th>
          <th className="text-right font-normal px-3 py-1.5">Fee</th>
        </tr>
      </thead>
      <tbody>
        {loading || matches.length === 0 ? (
          <EmptyRow cols={5} loading={loading} label="matches" />
        ) : matches.map((match) => (
          <tr key={match.event_index} className="border-b border-zinc-800/30 last:border-0">
            <td className="px-3 py-1.5 text-zinc-500 font-mono">{formatTimeAgo(match.block_time)}</td>
            <td className="px-3 py-1.5 text-zinc-500 font-mono">{formatAddress(match.source)}</td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{formatAmount(match.backward_quantity)} {match.backward_asset}</td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{formatAmount(match.forward_quantity)} {match.forward_asset}</td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{formatAmount(match.fee_quantity)} {match.fee_asset}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DepositsTable({ deposits, pool, loading }: { deposits: PoolDeposit[]; pool: PoolSummary | null; loading: boolean }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Time</th>
          <th className="text-left font-normal px-3 py-1.5">Address</th>
          <th className="text-right font-normal px-3 py-1.5">Assets</th>
          <th className="text-right font-normal px-3 py-1.5">LP Minted</th>
          <th className="text-right font-normal px-3 py-1.5">Type</th>
        </tr>
      </thead>
      <tbody>
        {loading || deposits.length === 0 ? (
          <EmptyRow cols={5} loading={loading} label="deposits" />
        ) : deposits.map((deposit) => (
          <tr key={deposit.event_index} className="border-b border-zinc-800/30 last:border-0">
            <td className="px-3 py-1.5 text-zinc-500 font-mono">{formatTimeAgo(deposit.block_time)}</td>
            <td className="px-3 py-1.5 text-zinc-500 font-mono">{formatAddress(deposit.source)}</td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">
              {formatPoolAmounts(pool, deposit.quantity_a, deposit.quantity_b)}
            </td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{formatAmount(deposit.quantity_minted)}</td>
            <td className="px-3 py-1.5 text-right text-zinc-500">{deposit.is_restart ? 'Restart' : 'Deposit'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WithdrawalsTable({ withdrawals, pool, loading }: { withdrawals: PoolWithdrawal[]; pool: PoolSummary | null; loading: boolean }) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="text-zinc-500 border-b border-zinc-800">
          <th className="text-left font-normal px-3 py-1.5">Time</th>
          <th className="text-left font-normal px-3 py-1.5">Address</th>
          <th className="text-right font-normal px-3 py-1.5">Assets</th>
          <th className="text-right font-normal px-3 py-1.5">LP Burned</th>
        </tr>
      </thead>
      <tbody>
        {loading || withdrawals.length === 0 ? (
          <EmptyRow cols={4} loading={loading} label="withdrawals" />
        ) : withdrawals.map((withdrawal) => (
          <tr key={withdrawal.event_index} className="border-b border-zinc-800/30 last:border-0">
            <td className="px-3 py-1.5 text-zinc-500 font-mono">{formatTimeAgo(withdrawal.block_time)}</td>
            <td className="px-3 py-1.5 text-zinc-500 font-mono">{formatAddress(withdrawal.source)}</td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">
              {formatPoolAmounts(pool, withdrawal.quantity_a, withdrawal.quantity_b)}
            </td>
            <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{formatAmount(withdrawal.quantity_destroyed)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EmptyRow({ cols, loading, label }: { cols: number; loading: boolean; label: string }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-8 text-zinc-500 text-xs">
        {loading ? `Loading ${label}...` : `No ${label} indexed yet`}
      </td>
    </tr>
  )
}
