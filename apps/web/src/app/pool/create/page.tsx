'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useBalance } from '@/lib/hooks/useBalance'
import { usePoolAssetInfo, usePoolByPair } from '@/lib/hooks/usePools'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'
import { formatAmount } from '@/utils/format-amount'

const POOL_ACTIVATION_BLOCK = 952800

function toRaw(value: string, divisible: boolean): number {
  const n = parseFloat(value.replace(/,/g, ''))
  if (!isFinite(n) || n <= 0) return 0
  return Math.round(n * (divisible ? 1e8 : 1))
}

export default function CreatePoolPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [assetAInput, setAssetAInput] = useState('')
  const [assetBInput, setAssetBInput] = useState('')
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')

  const assetA = assetAInput.trim().toUpperCase()
  const assetB = assetBInput.trim().toUpperCase()

  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { status: txStatus, txid, error: txError, composePoolDeposit, reset } = useCompose()

  const { info: infoA, isLoading: loadingA } = usePoolAssetInfo(step === 1 && assetA ? assetA : null)
  const { info: infoB, isLoading: loadingB } = usePoolAssetInfo(step === 1 && assetB ? assetB : null)
  const { pool: existingPool } = usePoolByPair(assetA || null, assetB || null)

  const divisibleA = infoA?.divisible ?? true
  const divisibleB = infoB?.divisible ?? true
  const { balance: balanceA } = useBalance(address, assetA || null)
  const { balance: balanceB } = useBalance(address, assetB || null)

  const samePair = assetA !== '' && assetA === assetB
  const bothResolved = !!infoA && !!infoB
  const step1Valid = assetA !== '' && assetB !== '' && !samePair && bothResolved && !existingPool

  const numA = parseFloat(amountA.replace(/,/g, '')) || 0
  const numB = parseFloat(amountB.replace(/,/g, '')) || 0
  const priceBperA = numA > 0 ? numB / numA : 0
  const priceAperB = numB > 0 ? numA / numB : 0
  const step2Valid = numA > 0 && numB > 0

  const isBusy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'

  const submit = () => {
    if (!step2Valid) return
    composePoolDeposit({
      asset_a: assetA,
      asset_b: assetB,
      quantity_a: toRaw(amountA, divisibleA),
      quantity_b: toRaw(amountB, divisibleB),
      min_lp_quantity: 0, // first deposit: you receive 100% of the new LP supply
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <div className="mx-auto max-w-md px-4 py-10">
        <Link href="/pool" className="text-xs text-zinc-500 hover:text-zinc-300">&larr; Pools</Link>

        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40">
          {/* Header / stepper */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h1 className="text-sm font-semibold text-zinc-100">Create a pool</h1>
            <span className="text-[11px] uppercase tracking-wider text-zinc-500">Step {step} of 3</span>
          </div>

          <div className="p-4">
            {/* ───────── Step 1: choose pair ───────── */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">Pick the two assets to pair. The first deposit sets the price.</p>
                <div className="grid grid-cols-2 gap-2">
                  <AssetField label="Asset A" value={assetAInput} onChange={setAssetAInput} info={infoA} loading={loadingA} />
                  <AssetField label="Asset B" value={assetBInput} onChange={setAssetBInput} info={infoB} loading={loadingB} />
                </div>

                {samePair && <Notice tone="error">Pick two different assets.</Notice>}
                {existingPool && (
                  <Notice tone="warn">
                    A pool for {assetA}/{assetB} already exists.{' '}
                    <Link href={`/pool/${existingPool.lp_asset}`} className="underline hover:text-zinc-100">Deposit into it instead &rarr;</Link>
                  </Notice>
                )}

                <button
                  onClick={() => setStep(2)}
                  disabled={!step1Valid}
                  className="w-full rounded-sm bg-green-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            )}

            {/* ───────── Step 2: amounts / price ───────── */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  Enter how much of each to deposit. The ratio <span className="text-amber-400">sets the starting price</span> — match the real market or arbitrage will drain the mispriced side.
                </p>
                <AmountField label={assetA} value={amountA} onChange={setAmountA} balance={balanceA} divisible={divisibleA} />
                <AmountField label={assetB} value={amountB} onChange={setAmountB} balance={balanceB} divisible={divisibleB} />

                <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs">
                  {step2Valid ? (
                    <div className="space-y-0.5 font-mono text-zinc-300">
                      <div>1 {assetA} = {formatAmount(priceBperA)} {assetB}</div>
                      <div className="text-zinc-500">1 {assetB} = {formatAmount(priceAperB)} {assetA}</div>
                    </div>
                  ) : (
                    <span className="text-zinc-500">Enter both amounts to see the implied price.</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="rounded-sm border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Back</button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!step2Valid}
                    className="flex-1 rounded-sm bg-green-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-40"
                  >
                    Review
                  </button>
                </div>
              </div>
            )}

            {/* ───────── Step 3: review / create ───────── */}
            {step === 3 && (
              <div className="space-y-3">
                <dl className="space-y-2 text-xs">
                  <Row label="Pair"><span className="font-mono text-zinc-200">{assetA} / {assetB}</span></Row>
                  <Row label="You deposit">
                    <span className="font-mono text-zinc-200">{formatAmount(numA)} {assetA} + {formatAmount(numB)} {assetB}</span>
                  </Row>
                  <Row label="Initial price"><span className="font-mono text-zinc-200">1 {assetA} = {formatAmount(priceBperA)} {assetB}</span></Row>
                  <Row label="LP token"><span className="text-zinc-400">Auto-generated &middot; you receive 100% of supply</span></Row>
                </dl>

                <Notice tone="muted">
                  Pools activate at block {POOL_ACTIVATION_BLOCK.toLocaleString()} — creating before then will be rejected by the network.
                </Notice>

                {txStatus === 'confirmed' && txid ? (
                  <Notice tone="ok">Broadcast: <span className="font-mono break-all">{txid}</span></Notice>
                ) : txStatus === 'error' && txError ? (
                  <Notice tone="error">{txError}</Notice>
                ) : null}

                <div className="flex gap-2">
                  {txStatus !== 'confirmed' && (
                    <button onClick={() => setStep(2)} disabled={isBusy} className="rounded-sm border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40">Back</button>
                  )}
                  {walletStatus !== 'connected' ? (
                    <button
                      onClick={() => connect()}
                      disabled={connecting}
                      className="flex-1 rounded-sm bg-green-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-40"
                    >
                      {connecting ? 'Connecting…' : 'Connect Wallet'}
                    </button>
                  ) : txStatus === 'confirmed' ? (
                    <Link href="/pool" className="flex-1 rounded-sm bg-green-500 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors">Done</Link>
                  ) : (
                    <button
                      onClick={txStatus === 'error' ? reset : submit}
                      disabled={isBusy || !step2Valid}
                      className="flex-1 rounded-sm bg-green-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors disabled:opacity-40"
                    >
                      {isBusy ? COMPOSE_STATUS_LABELS[txStatus] : txStatus === 'error' ? 'Try Again' : 'Create Pool'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetField({ label, value, onChange, info, loading }: {
  label: string; value: string; onChange: (v: string) => void; info: unknown; loading: boolean
}) {
  const resolved = !!info
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ASSET"
        spellCheck={false}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-mono uppercase text-zinc-200 outline-none focus:border-zinc-600 transition-colors"
      />
      <div className="mt-1 h-3 text-[10px]">
        {value.trim() === '' ? null : loading ? <span className="text-zinc-600">checking…</span> : resolved ? <span className="text-green-500">✓ found</span> : <span className="text-red-400">not found</span>}
      </div>
    </div>
  )
}

function AmountField({ label, value, onChange, balance, divisible }: {
  label: string; value: string; onChange: (v: string) => void; balance: number; divisible: boolean
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs text-zinc-500">{label}</label>
        {balance > 0 && (
          <button onClick={() => onChange(String(balance))} className="text-[10px] text-zinc-500 hover:text-zinc-300">
            bal {formatAmount(balance)} · Max
          </button>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={divisible ? '0.00000000' : '0'}
        inputMode="decimal"
        className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-200 outline-none focus:border-zinc-600 transition-colors"
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'warn' | 'ok' | 'muted'; children: React.ReactNode }) {
  const cls = {
    error: 'border-red-500/20 bg-red-500/5 text-red-400',
    warn: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    ok: 'border-green-500/20 bg-green-500/5 text-green-400',
    muted: 'border-zinc-800 bg-zinc-950/40 text-zinc-500',
  }[tone]
  return <div className={`rounded-sm border px-3 py-2 text-[11px] ${cls}`}>{children}</div>
}
