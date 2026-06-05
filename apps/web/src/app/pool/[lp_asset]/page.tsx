'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Chart } from '@/components/chart'
import { TogglePills } from '@/components/home/toggle-pills'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { useBalance } from '@/lib/hooks/useBalance'
import { usePool, usePoolAddressPosition, usePoolAssetInfo, usePoolDepositQuote, usePoolWithdrawQuote, type PoolAddressPosition, type PoolDeposit, type PoolDisplayAmounts, type PoolHolder, type PoolMatch, type PoolSummary, type PoolWithdrawal } from '@/lib/hooks/usePools'
import { useCompose } from '@/lib/wallet/useCompose'
import { useWallet } from '@/lib/wallet/wallet-context'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { COMPOSE_STATUS_LABELS, XCP_IMG_BASE } from '@/utils/constants'

type PoolDataTab = 'trades' | 'holders' | 'deposits' | 'withdrawals'
const POOL_DATA_TABS: [PoolDataTab, string][] = [
  ['trades', 'Trades'],
  ['holders', 'Holders'],
  ['deposits', 'Deposits'],
  ['withdrawals', 'Withdrawals'],
]

export default function PoolDetailPage() {
  const params = useParams<{ lp_asset: string }>()
  const lpAsset = decodeURIComponent(params.lp_asset ?? '').toUpperCase()
  const { pool, totalLpSupplyRaw, holders, deposits, withdrawals, matches, isLoading, error: poolError } = usePool(lpAsset)
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { position, isLoading: positionLoading, error: positionError } = usePoolAddressPosition(lpAsset, address)
  const [showInstall, setShowInstall] = useState(false)
  const [mobileDataTab, setMobileDataTab] = useState<PoolDataTab>('trades')
  const displayBase = pool?.display_base_asset ?? pool?.asset_a
  const displayQuote = pool?.display_quote_asset ?? pool?.asset_b
  const tradePair = pool?.display_pair_slug ?? (displayBase && displayQuote ? `${displayBase}_${displayQuote}` : pool?.pair)
  const poolNotFound = poolError instanceof Error && poolError.message.includes('404')

  if (!isLoading && poolNotFound) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Pool not found.</div>
      </div>
    )
  }

  if (!isLoading && poolError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Could not load pool data.</div>
      </div>
    )
  }

  if (!isLoading && !pool) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>
        <div className="mt-8 text-sm text-zinc-400">Pool not found.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <PoolHeader pool={pool} lpAsset={lpAsset} tradePair={tradePair} isLoading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:min-h-[calc(100vh-37px)] gap-px bg-zinc-800">
        <div className="hidden lg:flex lg:order-1 col-span-1 lg:col-span-3 bg-zinc-950 flex-col">
          {pool && (
            <PoolManagePanel
              pool={pool}
              position={position}
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
          {pool && <PoolKeyDetails pool={pool} totalLpSupplyRaw={totalLpSupplyRaw} />}
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
        </div>

        <div className="order-1 lg:order-2 col-span-1 lg:col-span-9 bg-zinc-950 flex flex-col">
          <div className="lg:hidden flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
            <div className="flex items-center -space-x-1">
              {pool && (
                <>
                  <Image src={`${XCP_IMG_BASE}/icon/${displayBase}`} alt="" width={24} height={24} className="rounded-sm border border-zinc-900" unoptimized />
                  <Image src={`${XCP_IMG_BASE}/icon/${displayQuote}`} alt="" width={24} height={24} className="rounded-sm border border-zinc-900" unoptimized />
                </>
              )}
            </div>
            <span className="text-xs font-semibold text-zinc-100">{pool ? pool.display_pair ?? `${pool.asset_a}/${pool.asset_b}` : lpAsset}</span>
            <span className="text-sm font-semibold text-zinc-100 font-mono ml-auto">
              {pool?.display_price != null ? formatAmount(pool.display_price) : '-'}
            </span>
          </div>

          {pool && tradePair ? (
            <Chart pairSlug={tradePair} pairLabel={pool.display_pair ?? `${pool.asset_a}/${pool.asset_b}`} />
          ) : (
            <div className="h-[340px] flex items-center justify-center text-xs text-zinc-500">Loading chart...</div>
          )}

          {pool && pool.restart_count > 0 && (
            <div className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              This pool has restarted after LP supply reached zero. Earlier reserves may affect position deltas.
            </div>
          )}

          <div className="hidden lg:block">
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

        <div className="order-3 lg:hidden bg-zinc-950 p-4 border-b border-zinc-800">
          {pool && (
            <PoolManagePanel
              pool={pool}
              position={position}
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
        </div>

        <div className="order-4 lg:hidden bg-zinc-950 flex border-b border-zinc-800">
          {POOL_DATA_TABS.map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setMobileDataTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                mobileDataTab === tab
                  ? 'text-zinc-100 border-b-2 border-green-500'
                  : 'text-zinc-500 border-b-2 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="order-5 lg:hidden bg-zinc-950 h-[340px] overflow-y-auto">
          <PoolTabContent
            activeTab={mobileDataTab}
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

      {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
    </div>
  )
}

function PoolHeader({
  pool,
  lpAsset,
  tradePair,
  isLoading,
}: {
  pool: PoolSummary | null
  lpAsset: string
  tradePair: string | undefined
  isLoading: boolean
}) {
  const baseAsset = pool?.display_base_asset ?? pool?.asset_a
  const quoteAsset = pool?.display_quote_asset ?? pool?.asset_b
  const pairLabel = pool ? pool.display_pair ?? `${pool.asset_a}/${pool.asset_b}` : lpAsset

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">Pools</Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center -space-x-1">
            {pool && (
              <>
                <Image src={`${XCP_IMG_BASE}/icon/${baseAsset}`} alt="" width={32} height={32} className="rounded-sm border border-zinc-950" unoptimized />
                <Image src={`${XCP_IMG_BASE}/icon/${quoteAsset}`} alt="" width={32} height={32} className="rounded-sm border border-zinc-950" unoptimized />
              </>
            )}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">{pairLabel}</h1>
            <span className="text-xs text-zinc-500 font-mono">LP {lpAsset}</span>
          </div>
        </div>

        <div className="h-8 w-px bg-zinc-800 max-sm:hidden" />

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-zinc-100 font-mono max-sm:text-base">
            {isLoading ? '-' : pool?.display_price != null ? formatAmount(pool.display_price) : '-'}
          </span>
          <span className="text-xs text-zinc-500">{quoteAsset}</span>
        </div>

        <div className="hidden md:flex gap-5 items-end">
          <HeaderStat label="Trades" value={pool ? pool.match_count.toLocaleString() : '-'} />
          <HeaderStat label="Fees" value={pool ? formatDisplayFees(pool) : '-'} />
          <HeaderStat label="Fee APY (30D)" value={pool ? formatApy(pool.implied_fee_apy_30d) : '-'} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {pool && tradePair && (
            <Link href={`/trade/${tradePair}`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Trade Pair
            </Link>
          )}
          {pool && (
            <Link href={`/${pool.lp_asset}`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              LP Asset
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xs text-zinc-300 font-mono">{value}</div>
    </div>
  )
}

function PoolKeyDetails({ pool, totalLpSupplyRaw }: { pool: PoolSummary; totalLpSupplyRaw: number }) {
  const baseAsset = pool.display_base_asset ?? pool.asset_a
  const quoteAsset = pool.display_quote_asset ?? pool.asset_b
  const totalSupply = totalLpSupplyRaw / 1e8

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

const SLIPPAGE_OPTIONS = [0.5, 1, 2.5] as const

function toRawAmount(value: string, divisible = true) {
  const parsed = parseFloat(value.replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.round(parsed * (divisible ? 1e8 : 1))
}

function fromRawAmount(value: number | null | undefined, divisible = true) {
  if (value == null || !Number.isFinite(value)) return ''
  return String(value / (divisible ? 1e8 : 1)).replace(/\.?0+$/, '')
}

function applySlippage(raw: number | null | undefined, slippagePercent: number) {
  if (raw == null || raw <= 0) return 0
  return Math.floor(raw * (1 - slippagePercent / 100))
}

function PoolManagePanel({
  pool,
  position,
  walletStatus,
  address,
  connecting,
  onConnect,
}: {
  pool: PoolSummary
  position: PoolAddressPosition | null
  walletStatus: 'not_detected' | 'disconnected' | 'connected'
  address: string | null
  connecting: boolean
  onConnect: () => void | Promise<void>
}) {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'swap'>('deposit')
  const [slippagePercent, setSlippagePercent] = useState<(typeof SLIPPAGE_OPTIONS)[number]>(1)
  const [depositA, setDepositA] = useState('')
  const [depositB, setDepositB] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const { info: assetAInfo } = usePoolAssetInfo(pool.asset_a)
  const { info: assetBInfo } = usePoolAssetInfo(pool.asset_b)
  const { balance: balanceA } = useBalance(address, pool.asset_a)
  const { balance: balanceB } = useBalance(address, pool.asset_b)
  const {
    status,
    txid,
    error,
    composePoolDeposit,
    composePoolWithdraw,
    reset,
  } = useCompose()

  const assetADivisible = assetAInfo?.divisible ?? true
  const assetBDivisible = assetBInfo?.divisible ?? true
  const depositARaw = toRawAmount(depositA, assetADivisible)
  const depositBRaw = toRawAmount(depositB, assetBDivisible)
  const withdrawRaw = toRawAmount(withdrawAmount, true)
  const { quote: depositQuote, isLoading: depositQuoteLoading } = usePoolDepositQuote(pool.asset_a, pool.asset_b, depositARaw)
  const { quote: withdrawQuote, isLoading: withdrawQuoteLoading } = usePoolWithdrawQuote(pool.asset_a, pool.asset_b, withdrawRaw)
  const minLpQuantity = applySlippage(depositQuote?.quantity_minted_estimate, slippagePercent)
  const minQuantityA = applySlippage(withdrawQuote?.quantity_a_estimate, slippagePercent)
  const minQuantityB = applySlippage(withdrawQuote?.quantity_b_estimate, slippagePercent)
  const isBusy = status === 'composing' || status === 'signing' || status === 'broadcasting'

  const quotedB = depositQuote?.quantity_b_required != null
    ? fromRawAmount(depositQuote.quantity_b_required, assetBDivisible)
    : ''
  const hasLpPosition = (position?.balance.balance_raw ?? 0) > 0
  const depositValid = depositARaw > 0 && depositBRaw > 0
  const withdrawValid = withdrawRaw > 0 && withdrawRaw <= (position?.balance.balance_raw ?? 0)

  const actionButton = (label: string, disabled: boolean, onClick: () => void) => {
    if (walletStatus !== 'connected') {
      return (
        <button
          onClick={onConnect}
          disabled={connecting}
          className="w-full rounded-sm bg-green-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )
    }

    return (
      <button
        onClick={status === 'confirmed' || status === 'error' ? reset : onClick}
        disabled={isBusy || disabled}
        className="w-full rounded-sm bg-green-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-50"
      >
        {status === 'confirmed'
          ? 'New Action'
          : status === 'error'
            ? 'Try Again'
            : isBusy
              ? COMPOSE_STATUS_LABELS[status]
              : label}
      </button>
    )
  }

  const submitDeposit = () => {
    if (!depositValid) return
    composePoolDeposit({
      asset_a: pool.asset_a,
      asset_b: pool.asset_b,
      quantity_a: depositARaw,
      quantity_b: depositBRaw,
      min_lp_quantity: minLpQuantity,
    })
  }

  const submitWithdraw = () => {
    if (!withdrawValid) return
    composePoolWithdraw({
      lp_asset: pool.lp_asset,
      quantity: withdrawRaw,
      min_quantity_a: minQuantityA,
      min_quantity_b: minQuantityB,
    })
  }

  return (
    <section className="border-b border-zinc-800">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800">
        <div>
          <div className="text-xs font-medium text-zinc-300">Liquidity</div>
          <div className="text-[11px] text-zinc-500">Deposit, withdraw, or swap with XCP Wallet approval.</div>
        </div>
        <div className="flex rounded-sm overflow-hidden border border-zinc-800">
          <button
            onClick={() => { setTab('deposit'); reset() }}
            className={`px-3 py-1.5 text-xs ${tab === 'deposit' ? 'bg-green-500/15 text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Deposit
          </button>
          <button
            onClick={() => { setTab('withdraw'); reset() }}
            className={`px-3 py-1.5 text-xs border-l border-zinc-800 ${tab === 'withdraw' ? 'bg-green-500/15 text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Withdraw
          </button>
          <button
            onClick={() => { setTab('swap'); reset() }}
            className={`px-3 py-1.5 text-xs border-l border-zinc-800 ${tab === 'swap' ? 'bg-green-500/15 text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Swap
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">Slippage</span>
          <TogglePills
            options={SLIPPAGE_OPTIONS}
            value={slippagePercent}
            onChange={setSlippagePercent}
            label={(value) => `${value}%`}
          />
        </div>

        {tab === 'deposit' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <PoolAmountInput
                label={pool.asset_a}
                value={depositA}
                onChange={setDepositA}
                balance={balanceA}
                disabled={isBusy}
              />
              <PoolAmountInput
                label={pool.asset_b}
                value={depositB}
                onChange={setDepositB}
                balance={balanceB}
                disabled={isBusy}
                action={quotedB ? { label: 'Use quote', onClick: () => setDepositB(quotedB) } : undefined}
              />
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">
              {depositQuoteLoading ? (
                'Loading deposit quote...'
              ) : depositQuote?.first_deposit ? (
                depositQuote.message ?? 'First deposit sets the initial pool price.'
              ) : depositQuote?.quantity_minted_estimate != null ? (
                <>
                  Quoted partner: <span className="font-mono text-zinc-300">{quotedB || '-'} {pool.asset_b}</span>
                  <span className="mx-2 text-zinc-700">/</span>
                  Minimum LP minted: <span className="font-mono text-zinc-300">{formatAmount(fromRawAmount(minLpQuantity, true) || 0)}</span>
                </>
              ) : (
                'Enter an amount to fetch the current pool ratio.'
              )}
            </div>

            {actionButton('Deposit Liquidity', !depositValid, submitDeposit)}
          </>
        ) : tab === 'withdraw' ? (
          <>
            <PoolAmountInput
              label={pool.lp_asset}
              value={withdrawAmount}
              onChange={setWithdrawAmount}
              balance={position?.balance.balance ?? 0}
              disabled={isBusy || !hasLpPosition}
              action={hasLpPosition ? { label: 'Max', onClick: () => setWithdrawAmount(String(position?.balance.balance ?? 0)) } : undefined}
            />

            <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">
              {withdrawQuoteLoading ? (
                'Loading withdraw quote...'
              ) : withdrawQuote?.pool_exists && withdrawQuote.quantity_a_estimate != null && withdrawQuote.quantity_b_estimate != null ? (
                <>
                  Minimum received: <span className="font-mono text-zinc-300">{formatAmount(fromRawAmount(minQuantityA, assetADivisible) || 0)} {pool.asset_a}</span>
                  <span className="mx-2 text-zinc-700">/</span>
                  <span className="font-mono text-zinc-300">{formatAmount(fromRawAmount(minQuantityB, assetBDivisible) || 0)} {pool.asset_b}</span>
                </>
              ) : withdrawQuote?.message ? (
                withdrawQuote.message
              ) : (
                'Enter LP tokens to preview underlying assets.'
              )}
            </div>

            {actionButton('Withdraw Liquidity', !withdrawValid, submitWithdraw)}
          </>
        ) : (
          <>
            <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-3 text-xs text-zinc-500">
              Pool swap composition is not available in this view yet.
            </div>
            <button
              disabled
              className="w-full rounded-sm bg-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 disabled:opacity-70"
            >
              Swap Unavailable
            </button>
          </>
        )}

        {status === 'confirmed' && txid && (
          <div className="rounded-sm border border-green-500/20 bg-green-500/5 px-3 py-1.5 text-xs text-green-400 font-mono truncate">
            Broadcast: {txid}
          </div>
        )}
        {status === 'error' && error && (
          <div className="rounded-sm border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </section>
  )
}

function PoolAmountInput({
  label,
  value,
  onChange,
  balance,
  disabled,
  action,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  balance: number
  disabled: boolean
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs text-zinc-500">{label}</label>
        <div className="flex items-center gap-2 text-[11px] text-zinc-600">
          <span className="font-mono">Bal {formatAmount(balance)}</span>
          {action && (
            <button type="button" onClick={action.onClick} className="text-green-400 hover:text-green-300">
              {action.label}
            </button>
          )}
        </div>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        disabled={disabled}
        placeholder="0"
        className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono disabled:opacity-50"
      />
    </div>
  )
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
