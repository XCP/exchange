'use client'

import { useState } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useBalance } from '@/lib/hooks/useBalance'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { useSatsMode } from '@/lib/sats-context'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import type { Dispenser } from '@/types/trading'

interface DispenseFormProps {
  asset: string
  sortedDispensers: Dispenser[]
  selectedIndex: number
  onSelectIndex: (i: number) => void
  divisible?: boolean
}

export function DispenseForm({ asset, sortedDispensers, selectedIndex, onSelectIndex }: DispenseFormProps) {
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { balance: assetBalance } = useBalance(address, asset)
  const feeRate = useFeeRate()
  const { status: txStatus, txid, error: txError, composeDispense, composeDispenser, reset } = useCompose()
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('1')

  // Sell (create) form state
  const [sellPrice, setSellPrice] = useState('')
  const [sellQtyPerDispense, setSellQtyPerDispense] = useState('')
  const [sellEscrow, setSellEscrow] = useState('')

  // Clamp index to valid range when dispensers change
  const clampedIndex = sortedDispensers.length === 0 ? 0 : Math.min(selectedIndex, sortedDispensers.length - 1)
  const selected = sortedDispensers[clampedIndex]
  const maxDispenses = selected && selected.give_quantity > 0 && Number.isFinite(selected.give_remaining / selected.give_quantity)
    ? Math.floor(selected.give_remaining / selected.give_quantity)
    : 0
  const qty = parseInt(quantity, 10) || 0
  const tokensReceived = selected ? (qty * parseFloat(selected.give_quantity_normalized)).toFixed(8).replace(/\.?0+$/, '') : '0'
  const btcCost = selected ? (qty * selected.satoshi_price / 1e8).toFixed(8) : '0.00000000'

  // Sell calculations
  const sellPriceNum = parseFloat(sellPrice) || 0
  const sellQtyNum = parseFloat(sellQtyPerDispense) || 0
  const sellBtcPerDispense = sellPriceNum > 0 && sellQtyNum > 0
    ? (sellPriceNum * sellQtyNum).toFixed(8)
    : '0.00000000'

  const isBusy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'

  const handleBuy = () => {
    if (!selected || qty <= 0) return
    composeDispense({
      dispenser: selected.source,
      quantity: qty * selected.satoshi_price,
    })
  }

  const handleSell = () => {
    if (!sellPriceNum || !sellQtyNum || !sellEscrow) return
    const assetMul = divisible ? 1e8 : 1
    const mainchainrate = Math.round(sellPriceNum * sellQtyNum * 1e8) // BTC is always divisible
    composeDispenser({
      asset,
      give_quantity: Math.round(sellQtyNum * assetMul),
      escrow_quantity: Math.round(parseFloat(sellEscrow) * assetMul),
      mainchainrate,
    })
  }

  const [showInstall, setShowInstall] = useState(false)

  const actionButton = (color: 'green' | 'red', label: string, onSubmit: () => void) => {
    if (walletStatus !== 'connected') {
      return (
        <>
          <button
            onClick={walletStatus === 'disconnected' ? connect : () => setShowInstall(true)}
            disabled={connecting}
            className={`w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              color === 'green'
                ? 'bg-green-500 text-zinc-950 hover:bg-green-400'
                : 'bg-red-500 text-zinc-950 hover:bg-red-400'
            } disabled:opacity-50`}
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
        </>
      )
    }

    return (
      <button
        onClick={txStatus === 'confirmed' || txStatus === 'error' ? reset : onSubmit}
        disabled={isBusy}
        className={`w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
          color === 'green'
            ? 'bg-green-500 text-zinc-950 hover:bg-green-400'
            : 'bg-red-500 text-zinc-950 hover:bg-red-400'
        } disabled:opacity-50`}
      >
        {txStatus === 'confirmed'
          ? 'Done'
          : txStatus === 'error'
            ? 'Try Again'
            : isBusy
              ? COMPOSE_STATUS_LABELS[txStatus]
              : label}
      </button>
    )
  }

  const txFeedback = (
    <>
      {txStatus === 'confirmed' && txid && (
        <div className="rounded-sm border border-green-500/20 bg-green-500/5 px-3 py-1.5 text-xs text-green-400 font-mono truncate">
          Confirmed: {txid}
        </div>
      )}
      {txStatus === 'error' && txError && (
        <div className="rounded-sm border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
          {txError}
        </div>
      )}
    </>
  )

  return (
    <div className="p-3 border-b border-zinc-800">
      {/* Buy/Sell toggle */}
      <div className="mb-3 flex rounded-sm overflow-hidden">
        <button
          onClick={() => { setTab('buy'); reset() }}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            tab === 'buy'
              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
              : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => { setTab('sell'); reset() }}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            tab === 'sell'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
          }`}
        >
          Sell
        </button>
      </div>

      {tab === 'buy' ? (
        <div className="space-y-2">
          {/* Dispenser selector */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Dispenser</label>
            {sortedDispensers.length === 0 ? (
              <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-600">
                No open dispensers
              </div>
            ) : (
              <select
                value={clampedIndex}
                onChange={(e) => onSelectIndex(Number(e.target.value))}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600 transition-colors font-mono"
              >
                {sortedDispensers.map((d, i) => (
                  <option key={d.tx_hash} value={i}>
                    {formatPrice(parseFloat(d.price_normalized), satsMode)} {btcLabel}/ea — {formatAddress(d.source)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* BTC price per dispense (read-only) */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{btcLabel.toUpperCase()} per Dispense</label>
            <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
              {selected ? `${formatPrice(parseFloat(selected.satoshi_price_normalized), satsMode)} ${btcLabel}` : '—'}
            </div>
          </div>

          {/* Quantity (number of dispenses) */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-zinc-500">Dispenses</label>
              {maxDispenses > 0 && (
                <button
                  onClick={() => setQuantity(String(maxDispenses))}
                  className="text-[10px] font-medium text-green-400 hover:text-green-300 transition-colors"
                >
                  Max ({maxDispenses})
                </button>
              )}
            </div>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
              placeholder="1"
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
            />
            {maxDispenses > 1 && (
              <div className="flex gap-1 mt-1">
                {[10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setQuantity(String(Math.max(1, Math.floor(maxDispenses * pct / 100))))}
                    className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tokens received */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">You Receive ({asset})</label>
            <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-green-400 font-mono">
              {tokensReceived}
            </div>
          </div>

          {/* BTC cost */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-zinc-600">Total {btcLabel.toUpperCase()}</span>
            <span className="text-zinc-500 font-mono">{satsMode ? formatPrice(parseFloat(btcCost) || 0, true) : btcCost} {btcLabel}</span>
          </div>

          {actionButton('green', `Buy ${asset}`, handleBuy)}
          {txFeedback}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Price per token */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Price per {asset} ({btcLabel.toUpperCase()})</label>
            <input
              type="text"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="0.00000000"
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
            />
          </div>

          {/* Tokens per dispense */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{asset} per Dispense</label>
            <input
              type="text"
              value={sellQtyPerDispense}
              onChange={(e) => setSellQtyPerDispense(e.target.value)}
              placeholder="0"
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
            />
          </div>

          {/* Total escrow */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-zinc-500">Total {asset} to Escrow</label>
              {assetBalance > 0 && (
                <button
                  onClick={() => setSellEscrow(String(assetBalance))}
                  className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors"
                >
                  Max ({assetBalance})
                </button>
              )}
            </div>
            <input
              type="text"
              value={sellEscrow}
              onChange={(e) => setSellEscrow(e.target.value)}
              placeholder="0"
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
            />
            {assetBalance > 0 && (
              <div className="flex gap-1 mt-1">
                {[10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setSellEscrow((assetBalance * pct / 100).toFixed(8).replace(/\.?0+$/, ''))}
                    className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* BTC per dispense (calculated) */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{btcLabel.toUpperCase()} per Dispense</label>
            <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
              {satsMode ? formatPrice(parseFloat(sellBtcPerDispense) || 0, true) : sellBtcPerDispense} {btcLabel}
            </div>
          </div>

          {/* Fee */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-zinc-600">Fee</span>
            <span className="text-zinc-500 font-mono">
              {feeRate != null ? `~${feeRate} sat/vB` : '—'}
            </span>
          </div>

          {actionButton('red', 'Create Dispenser', handleSell)}
          {txFeedback}
        </div>
      )}
    </div>
  )
}
