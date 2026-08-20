'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useUtxoBalances } from '@/lib/hooks/useUtxoBalances'
import { useCompose } from '@/lib/wallet/useCompose'
import { useAssetInfo } from '@/lib/hooks/useAssetInfo'
import { toBase, sanitizeAmountInput, rawErrorMessage } from '@/utils/numeric'
import { formatAmount } from '@/utils/format-amount'
import { XCP_IMG_BASE, COMPOSE_STATUS_LABELS } from '@/utils/constants'

export function PortfolioUtxos({ address }: { address: string }) {
  const { balances, isLoading, mutate } = useUtxoBalances(address)
  const [showAttachModal, setShowAttachModal] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-zinc-500">Loading UTXO balances...</span>
      </div>
    )
  }

  return (
    <div>
      {/* Header with Attach button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">
          {balances.length} UTXO-attached asset{balances.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowAttachModal(true)}
          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium rounded-sm transition-colors"
        >
          Attach Asset
        </button>
      </div>

      {balances.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <span className="text-xs text-zinc-500">
            No UTXO-attached assets found
          </span>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="grid grid-cols-5 gap-0 px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800 max-sm:grid-cols-3">
            <span>Asset</span>
            <span className="text-right">Quantity</span>
            <span className="text-right max-sm:hidden">UTXO</span>
            <span className="max-sm:hidden"></span>
            <span className="text-right">Actions</span>
          </div>

          {/* Rows */}
          <div className="px-1">
            {balances.map((bal) => {
              const [txid, voutStr] = bal.utxo.split(':')
              return (
                <div
                  key={bal.utxo + bal.asset}
                  className="grid grid-cols-5 gap-0 px-2 py-1.5 text-xs hover:bg-zinc-800/50 transition-colors items-center max-sm:grid-cols-3"
                >
                  <div className="flex items-center gap-2">
                    <Image
                      src={`${XCP_IMG_BASE}/icon/${bal.asset}`}
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-sm"
                      unoptimized
                    />
                    <span className="text-zinc-100 font-medium">
                      {bal.asset_longname ?? bal.asset}
                    </span>
                  </div>
                  <span className="text-right text-zinc-300 font-mono">
                    {formatAmount(bal.quantity)}
                  </span>
                  <span className="text-right text-zinc-500 font-mono text-[10px] max-sm:hidden">
                    {txid.slice(0, 8)}...:{voutStr}
                  </span>
                  <span className="max-sm:hidden"></span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <Link
                      href={`/atomic/sell?utxo=${bal.utxo}&asset=${bal.asset}&qty=${bal.quantity}${bal.asset_longname ? `&longname=${bal.asset_longname}` : ''}`}
                      className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold rounded-sm transition-colors"
                    >
                      Sell
                    </Link>
                    <DetachButton utxo={bal.utxo} onDone={() => mutate()} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Attach modal */}
      {showAttachModal && (
        <AttachModal
          onClose={() => setShowAttachModal(false)}
          onDone={() => { setShowAttachModal(false); mutate() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detach Button (inline, per-row)
// ---------------------------------------------------------------------------
function DetachButton({ utxo, onDone }: { utxo: string; onDone: () => void }) {
  const { status, error, composeDetach, reset } = useCompose()

  useEffect(() => {
    if (status === 'confirmed') {
      const t = setTimeout(() => { reset(); onDone() }, 2000)
      return () => clearTimeout(t)
    }
  }, [status, reset, onDone])

  if (status === 'confirmed') {
    return <span className="text-green-400 text-[10px]">Detached!</span>
  }

  if (status !== 'idle' && status !== 'error') {
    return (
      <span className="text-zinc-500 text-[10px]">
        {COMPOSE_STATUS_LABELS[status] ?? status}
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => composeDetach(utxo)}
        className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] font-medium rounded-sm transition-colors"
      >
        Detach
      </button>
      {error && <span className="text-red-400 text-[10px]">{error}</span>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Attach Modal — user picks asset name + quantity (Counterparty handles UTXO selection)
// ---------------------------------------------------------------------------
function AttachModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const { status, error, txid, composeAttach, reset } = useCompose()
  const [asset, setAsset] = useState('')
  const [quantity, setQuantity] = useState('')
  // Attach had NO divisibility handling: parseInt on the typed quantity meant
  // "1" of a divisible asset attached one base unit — 0.00000001 — rather
  // than one token. The asset's own flag decides the scale.
  const { info, error: infoError, notFound: infoNotFound } = useAssetInfo(asset || null)
  const divisible: boolean | undefined = info?.divisible
  const quantityResult = toBase(quantity, divisible)
  const quantityError = !quantityResult.ok && quantity.trim() !== '' ? quantityResult.error : null

  useEffect(() => {
    if (status === 'confirmed') {
      const t = setTimeout(() => { reset(); onDone() }, 2000)
      return () => clearTimeout(t)
    }
  }, [status, reset, onDone])

  function handleAttach() {
    if (!asset || !quantityResult.ok || quantityResult.raw <= 0) return
    composeAttach({ asset, quantity: quantityResult.base })
  }

  const buttonLabel =
    COMPOSE_STATUS_LABELS[status] ?? (status === 'confirmed' ? 'Attached!' : 'Attach')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-sm w-full max-w-sm mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">Attach Asset to UTXO</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Asset Name</label>
            <input
              type="text"
              value={asset}
              onChange={(e) => setAsset(e.target.value.trim())}
              placeholder="e.g. PEPECASH"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Quantity</label>
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(sanitizeAmountInput(e.target.value, divisible))}
              placeholder={divisible === false ? 'Whole units' : 'Amount to attach'}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-zinc-600"
            />
            {quantityError && (
              <p className="mt-1 text-[10px] text-amber-400">
                {quantityError === 'unknown-divisibility' && infoNotFound
                  ? `${asset} was not found.`
                  : quantityError === 'unknown-divisibility' && infoError
                    ? `Couldn't load ${asset}'s details. Try again.`
                    : rawErrorMessage(quantityError, asset)}
              </p>
            )}
          </div>

          <p className="text-[10px] text-zinc-500">
            The Counterparty node will select a UTXO and attach your asset balance to it.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleAttach}
              disabled={status !== 'idle' || !asset || !quantityResult.ok || quantityResult.raw <= 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-sm transition-colors"
            >
              {buttonLabel}
            </button>
            <button
              onClick={onClose}
              disabled={status !== 'idle' && status !== 'error' && status !== 'confirmed'}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium rounded-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {error && <p className="text-red-400 text-[10px]">{error}</p>}
          {txid && (
            <p className="text-green-400 text-[10px]">
              Attached!{' '}
              <a
                href={`https://mempool.space/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {txid.slice(0, 12)}...
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
