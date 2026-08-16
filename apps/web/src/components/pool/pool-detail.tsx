'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PoolCharts } from '@/components/pool/pool-charts'
import { PoolManagePanel } from '@/components/pool/pool-manage-panel'
import { FormSettings, PoolSlippageSetting } from '@/components/form-settings'
import { useFormSettings } from '@/lib/hooks/useFormSettings'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { usePool, usePoolAddressPosition, type PoolAddressPosition, type PoolDeposit, type PoolDisplayAmounts, type PoolHolder, type PoolMatch, type PoolSummary, type PoolWithdrawal } from '@/lib/hooks/usePools'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { fromSats } from '@/utils/numeric'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'
import { OTHER_POOL_FEE_BPS, poolFeeBps, poolFeeLabel } from '@/utils/pool-fee'

type PoolDataTab = 'trades' | 'holders' | 'deposits' | 'withdrawals'
const POOL_DATA_TABS: [PoolDataTab, string][] = [
  ['trades', 'Trades'],
  ['holders', 'Holders'],
  ['deposits', 'Deposits'],
  ['withdrawals', 'Withdrawals'],
]

/**
 * The pool view, now reached at /LP_ASSET rather than /pool/LP_ASSET.
 *
 * An LP token IS an asset — it has a supply, holders and a page like any
 * other — so it lives in the asset namespace with everything else, and
 * /pool/… redirects here.
 */
export default function PoolDetailPage({ lpAsset: lpAssetProp }: { lpAsset: string }) {
  const lpAsset = lpAssetProp.toUpperCase()
  const { pool, totalLpSupplyRaw, holders, deposits, withdrawals, matches, isLoading, error: poolError } = usePool(lpAsset)
  const { status: walletStatus, address } = useWallet()
  const { position, isLoading: positionLoading, error: positionError } = usePoolAddressPosition(lpAsset, address)
  const [showInstall, setShowInstall] = useState(false)
  /** The forms stay folded away until asked for — see the rail below. */
  const [manageOpen, setManageOpen] = useState(false)
  const { poolSlippage, setPoolSlippage } = useFormSettings()
  const displayBase = pool?.display_base_asset ?? pool?.asset_a
  const displayQuote = pool?.display_quote_asset ?? pool?.asset_b
  const tradePair = pool?.display_pair_slug ?? (displayBase && displayQuote ? `${displayBase}_${displayQuote}` : pool?.pair)
  const poolNotFound = poolError instanceof Error && poolError.message.includes('404')

  if (!isLoading && poolNotFound) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/explore/pools" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Pool not found.</div>
      </div>
    )
  }

  if (!isLoading && poolError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/explore/pools" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Could not load pool data.</div>
      </div>
    )
  }

  if (!isLoading && !pool) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/explore/pools" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Pool not found.</div>
      </div>
    )
  }

  const pairLabel = pool ? pool.display_pair ?? `${pool.asset_a}/${pool.asset_b}` : lpAsset
  const baseAsset = displayBase ?? ''
  const quoteAsset = displayQuote ?? ''
  // Reserves in the pair's display orientation, which is what every figure
  // in the right rail and both derived charts are denominated in.
  const reserveBase = pool?.display_base_reserve ?? pool?.reserve_a ?? 0
  const reserveQuote = pool?.display_quote_reserve ?? pool?.reserve_b ?? 0
  // Counterparty charges 50bps on a pool with an XCP leg and 100bps on any
  // other pair. It is protocol, not per-pool config, so it is derived here
  // rather than stored — and it matches what the pool list shows.
  const feeBps = pool ? poolFeeBps(pool.asset_a, pool.asset_b) : OTHER_POOL_FEE_BPS
  const feeTier = pool ? poolFeeLabel(pool.asset_a, pool.asset_b) : '—'
  // Both sides of a constant-product pool are worth the same at its own
  // price, so total value locked is twice either side.
  const tvlQuote = reserveQuote * 2

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Link href="/explore/pools" className="transition-colors hover:text-zinc-300">Pools</Link>
          <span aria-hidden>›</span>
          <span className="text-zinc-300">{pairLabel}</span>
        </div>

        <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
          {/* Ringed in the PAGE colour, not a border colour: the front icon
              has to punch a clean hole out of the one behind it, or the two
              circles just look clipped. The quote sits in front because it is
              the denominator the pair is read against. */}
          <div className="flex shrink-0 items-center -space-x-2.5">
            {baseAsset && (
              <Image src={`${XCP_IMG_BASE}/icon/${baseAsset}`} alt="" width={32} height={32} className="rounded-full ring-2 ring-zinc-950" unoptimized />
            )}
            {quoteAsset && (
              <Image src={`${XCP_IMG_BASE}/icon/${quoteAsset}`} alt="" width={32} height={32} className="relative rounded-full ring-2 ring-zinc-950" unoptimized />
            )}
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">{pairLabel}</h1>
          <span className="rounded-sm border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">{feeTier}</span>
          <span className="font-mono text-[11px] text-zinc-600">{lpAsset}</span>
        </div>

        {pool && pool.restart_count > 0 && (
          <div className="mb-4 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            This pool has restarted after LP supply reached zero. Earlier reserves may affect position deltas.
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-6">
            {pool ? (
              <PoolCharts
                pairSlug={tradePair ?? null}
                lpAsset={lpAsset}
                baseAsset={baseAsset}
                quoteAsset={quoteAsset}
                reserveBase={reserveBase}
                reserveQuote={reserveQuote}
                feeBps={feeBps}
              />
            ) : (
              <div className="flex h-[360px] items-center justify-center rounded-sm border border-zinc-800 text-xs text-zinc-500">
                Loading pool…
              </div>
            )}

            <div className="rounded-sm border border-zinc-800">
              <PoolDataTabs
                holders={holders}
                pool={pool}
                totalLpSupplyRaw={totalLpSupplyRaw}
                matches={matches}
                deposits={deposits}
                withdrawals={withdrawals}
                loading={isLoading}
              />
            </div>
          </div>

          <aside className="space-y-4">
            {/* Read-first: the forms are one click away rather than occupying
                the rail before anyone has decided to act. */}
            {/* The gear appears with the form it configures. This page has no
                mode tabs to hang it from, so it sits beside the disclosure. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setManageOpen((v) => !v)}
                className={`w-full rounded-sm px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  manageOpen
                    ? 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100'
                    : 'bg-green-500 text-zinc-950 hover:bg-green-400'
                }`}
              >
                {manageOpen ? 'Close' : '+ Add or remove liquidity'}
              </button>
              {manageOpen && (
                <FormSettings>
                  <PoolSlippageSetting value={poolSlippage} onChange={setPoolSlippage} />
                </FormSettings>
              )}
            </div>

            {manageOpen && pool && (
              <PoolManagePanel
                pool={pool}
                position={position}
                walletStatus={walletStatus}
                address={address}
                slippagePercent={poolSlippage}
              />
            )}

            {pool && (
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Stats</h2>

                <p className="text-[11px] text-zinc-500">Pool balances</p>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-xs text-zinc-200">
                  <span>{formatAmount(reserveBase)} {baseAsset}</span>
                  <span>{formatAmount(reserveQuote)} {quoteAsset}</span>
                </div>
                {/* Always half and half by construction — the bar is there to
                    show the split holds, and to read the two sides as one
                    quantity rather than two unrelated numbers. */}
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <span className="w-1/2 bg-green-500/70" />
                  <span className="w-1/2 bg-zinc-600" />
                </div>

                <div className="mt-4 border-t border-zinc-800 pt-1">
                <SidebarMetric label={`TVL (${quoteAsset})`} value={formatAmount(tvlQuote)} />
                <SidebarMetric label="Price" value={pool.display_price != null ? `${formatAmount(pool.display_price)} ${quoteAsset}` : '—'} />
                <SidebarMetric label={`Volume 24h (${quoteAsset})`} value={formatAmount(pool.display_volume_24h_quote ?? 0)} />
                <SidebarMetric label={`Fees 24h (${quoteAsset})`} value={formatAmount(pool.display_fees_24h_quote ?? 0)} />
                <SidebarMetric label="Fee APY (24h)" value={formatApy(pool.implied_fee_apy_24h)} />
                <SidebarMetric label="Trades" value={pool.match_count.toLocaleString()} />
                </div>
              </div>
            )}

            {pool && <PoolKeyDetails pool={pool} totalLpSupplyRaw={totalLpSupplyRaw} />}

            {/* Renders its own connect / empty / loading states, so it is not
                gated on there being a position to show. */}
            {pool && (
              <YourPositionPanel
                pool={pool}
                position={position}
                loading={positionLoading}
                error={positionError}
                walletStatus={walletStatus}
                address={address}
              />
            )}
          </aside>
        </div>
      </div>

      {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
    </div>
  )
}

function PoolKeyDetails({ pool, totalLpSupplyRaw }: { pool: PoolSummary; totalLpSupplyRaw: number }) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  // LP tokens are always divisible.
  const totalSupply = fromSats(totalLpSupplyRaw)

  return (
    <section className="border-b border-zinc-800">
      <div className="px-3 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-300">Pool Details</div>
      <div className="p-3 space-y-2">
        <SidebarMetric label="Base Liquidity" value={`${formatAmount(pool.display_base_reserve ?? pool.reserve_a)} ${baseAsset}`} />
        <SidebarMetric label="Quote Liquidity" value={`${formatAmount(pool.display_quote_reserve ?? pool.reserve_b)} ${quoteAsset}`} />
        <SidebarMetric label="LP Supply" value={formatAmount(totalSupply)} />
        <SidebarMetric label="Fees" value={`${formatDisplayFees(pool)} ${baseAsset}/${quoteAsset}`} />
        <SidebarMetric label="Fee APY (30D)" value={formatApy(pool.implied_fee_apy_30d)} />
      </div>
    </section>
  )
}

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-300 font-mono text-right">{value}</span>
    </div>
  )
}

function PoolDataTabs({
  holders,
  pool,
  totalLpSupplyRaw,
  matches,
  deposits,
  withdrawals,
  loading,
}: {
  holders: PoolHolder[]
  pool: PoolSummary | null
  totalLpSupplyRaw: number
  matches: PoolMatch[]
  deposits: PoolDeposit[]
  withdrawals: PoolWithdrawal[]
  loading: boolean
}) {
  const [activeTab, setActiveTab] = useState<PoolDataTab>('trades')

  return (
    <>
      <div className="flex border-b border-zinc-800">
        {POOL_DATA_TABS.map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-zinc-100 border-b-2 border-green-500'
                : 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="h-[340px] overflow-y-auto">
        <PoolTabContent
          activeTab={activeTab}
          holders={holders}
          pool={pool}
          totalLpSupplyRaw={totalLpSupplyRaw}
          matches={matches}
          deposits={deposits}
          withdrawals={withdrawals}
          loading={loading}
        />
      </div>
    </>
  )
}

function PoolTabContent({
  activeTab,
  holders,
  pool,
  totalLpSupplyRaw,
  matches,
  deposits,
  withdrawals,
  loading,
}: {
  activeTab: PoolDataTab
  holders: PoolHolder[]
  pool: PoolSummary | null
  totalLpSupplyRaw: number
  matches: PoolMatch[]
  deposits: PoolDeposit[]
  withdrawals: PoolWithdrawal[]
  loading: boolean
}) {
  if (activeTab === 'holders') {
    return <PoolHoldersTable holders={holders} pool={pool} totalLpSupplyRaw={totalLpSupplyRaw} loading={loading} />
  }
  if (activeTab === 'deposits') {
    return <DepositsTable deposits={deposits} pool={pool} loading={loading} />
  }
  if (activeTab === 'withdrawals') {
    return <WithdrawalsTable withdrawals={withdrawals} pool={pool} loading={loading} />
  }
  return <MatchesTable matches={matches} loading={loading} />
}

function formatApy(apy: number | null | undefined) {
  if (apy == null || !Number.isFinite(apy)) return '-'
  return `${(apy * 100).toFixed(2)}%`
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
  error,
  walletStatus,
  address,
}: {
  pool: PoolSummary
  position: PoolAddressPosition | null
  loading: boolean
  error: unknown
  walletStatus: 'not_detected' | 'disconnected' | 'connected'
  address: string | null
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
          <div className="text-xs font-medium text-zinc-300">Your LP Position</div>
          <div className="text-[11px] text-zinc-500 font-mono">{address ? formatAddress(address) : 'Wallet not connected'}</div>
        </div>
      </div>

      {walletStatus !== 'connected' ? (
        <div className="px-3 py-4 text-xs text-zinc-500">Connect from the wallet menu to see LP balance, reserve claim, and deposit-basis estimate.</div>
      ) : error ? (
        <div className="px-3 py-4 text-xs text-zinc-500">Could not load your pool position.</div>
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
            <PositionMetric label="Implied Fee Share" value={`${formatAmount(baseFees)} ${baseAsset} / ${formatAmount(quoteFees)} ${quoteAsset}`} />
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
    <div className="overflow-x-auto">
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
              <td className="px-3 py-1.5 text-zinc-500 font-mono" title={holder.holder}>
                {holder.holder_type === 'utxo' ? `${formatAddress(holder.owner_address ?? holder.address)} UTXO` : formatAddress(holder.address)}
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
    </div>
  )
}

function MatchesTable({ matches, loading }: { matches: PoolMatch[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
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
    </div>
  )
}

function DepositsTable({ deposits, pool, loading }: { deposits: PoolDeposit[]; pool: PoolSummary | null; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
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
    </div>
  )
}

function WithdrawalsTable({ withdrawals, pool, loading }: { withdrawals: PoolWithdrawal[]; pool: PoolSummary | null; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
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
    </div>
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
