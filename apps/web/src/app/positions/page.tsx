'use client'

import Link from 'next/link'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useConnectFlow } from '@/lib/wallet/useConnectFlow'
import { useAddressPools, type AddressPoolSummary } from '@/lib/hooks/usePools'
import { formatAmount } from '@/utils/format-amount'
import { formatAddress } from '@/utils/format-address'
import { poolFeeLabel } from '@/utils/pool-fee'

/**
 * Your liquidity, pool by pool.
 *
 * The only page under Pool that cannot exist without a wallet — Deposit and
 * Withdrawal are forms you can read before connecting, but a position is
 * definitionally somebody's. So this is the one that gates.
 *
 * It is not a Portfolio tab because Portfolio answers "what do I hold" and
 * an LP token is a terrible answer to that question: the balance is a share
 * of two other assets, and the number that matters is what it redeems for.
 */
export default function PositionsPage() {
  const { status, address } = useWallet()
  const wallet = useConnectFlow()
  const { pools, isLoading } = useAddressPools(status === 'connected' ? address : null)

  if (status !== 'connected' || !address) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="flex items-center justify-center py-32">
          <div className="space-y-4 text-center">
            <h1 className="text-lg font-semibold">Positions</h1>
            <p className="text-sm text-zinc-500">Connect your wallet to see your liquidity</p>
            <button
              onClick={wallet.start}
              disabled={wallet.connecting}
              className="rounded-sm bg-green-500 px-6 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-green-400 disabled:opacity-50"
            >
              {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
            {wallet.installModal}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 text-lg font-semibold text-zinc-100">Positions</h1>
            <p className="text-xs text-zinc-500">
              LP tokens held by <span className="font-mono">{formatAddress(address)}</span>
            </p>
          </div>
          <Link
            href="/liquidity/deposit"
            className="rounded-sm bg-green-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-950 transition-colors hover:bg-green-400"
          >
            + Add liquidity
          </Link>
        </div>

        {isLoading && pools.length === 0 && (
          <p className="py-16 text-center text-xs text-zinc-500">Loading positions…</p>
        )}

        {!isLoading && pools.length === 0 && (
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 py-16 text-center">
            <p className="text-sm text-zinc-400">No liquidity positions.</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
              Depositing into a pool mints you LP tokens, which earn a share of every swap that
              pool settles.
            </p>
            <Link
              href="/liquidity/deposit"
              className="mt-4 inline-block rounded-sm bg-green-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 transition-colors hover:bg-green-400"
            >
              Deposit
            </Link>
          </div>
        )}

        {pools.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {pools.map((p) => (
              <PositionCard key={p.lp_asset} pool={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A card rather than a table row: a position is four related numbers about one
 * pool, and a row would put the two underlying legs in columns that mean
 * different things on every line.
 */
function PositionCard({ pool: p }: { pool: AddressPoolSummary }) {
  // Share of the pool, from the LP supply. Both are base-unit integers from
  // the same asset, so the ratio is safe as a double even when they are not.
  const share = p.total_lp_supply_raw > 0 ? p.balance_raw / p.total_lp_supply_raw : 0
  const underlyingA = p.reserve_a * share
  const underlyingB = p.reserve_b * share
  const pairLabel = p.display_pair ?? p.pair

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
      <div className="mb-3 flex items-start justify-between gap-3">
        <Link href={`/pool/${p.lp_asset}`} className="text-sm font-semibold text-zinc-100 hover:text-green-400">
          {pairLabel}
        </Link>
        <span className="rounded-sm border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
          {poolFeeLabel(p.asset_a, p.asset_b)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-zinc-500">Pool share</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-zinc-200">
            {share > 0 && share < 0.0001 ? '<0.01' : (share * 100).toFixed(2)}%
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">LP tokens</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-zinc-200">{formatAmount(p.balance)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{p.asset_a}</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-zinc-200">{formatAmount(underlyingA)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{p.asset_b}</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-zinc-200">{formatAmount(underlyingB)}</dd>
        </div>
      </dl>

      {/* Fees are shown only when there are some. A pair of zeros on a pool
          that has never traded says nothing a reader wants to know. */}
      {(p.implied_fees_a > 0 || p.implied_fees_b > 0) && (
        <p className="mt-3 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">
          Fees earned{' '}
          <span className="font-mono text-zinc-400">
            {formatAmount(p.implied_fees_a)} {p.asset_a}
          </span>
          {' · '}
          <span className="font-mono text-zinc-400">
            {formatAmount(p.implied_fees_b)} {p.asset_b}
          </span>
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Link
          href={`/liquidity/deposit/${encodeURIComponent(p.asset_a)}/${encodeURIComponent(p.asset_b)}`}
          className="flex-1 rounded-sm border border-zinc-800 py-1.5 text-center text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
        >
          Deposit
        </Link>
        <Link
          href={`/liquidity/withdrawal/${encodeURIComponent(p.asset_a)}/${encodeURIComponent(p.asset_b)}`}
          className="flex-1 rounded-sm border border-zinc-800 py-1.5 text-center text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
        >
          Withdraw
        </Link>
      </div>
    </div>
  )
}
