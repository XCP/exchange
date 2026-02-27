'use client'

import { useState as useLocalState } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useBalance } from '@/lib/hooks/useBalance'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'
import { WalletInstallModal } from '@/components/wallet-install-modal'

interface TradeFormProps {
  baseSymbol: string
  quoteSymbol: string
  tradeTab: 'buy' | 'sell'
  setTradeTab: (tab: 'buy' | 'sell') => void
  priceInput: string
  setPriceInput: (v: string) => void
  amountInput: string
  setAmountInput: (v: string) => void
}

export function TradeForm({
  baseSymbol,
  quoteSymbol,
  tradeTab,
  setTradeTab,
  priceInput,
  setPriceInput,
  amountInput,
  setAmountInput,
}: TradeFormProps) {
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { status: txStatus, txid, error: txError, composeOrder, reset } = useCompose()

  // Fetch balance of the asset the user is spending
  const spendAsset = tradeTab === 'buy' ? quoteSymbol : baseSymbol
  const { balance: spendBalance } = useBalance(address, spendAsset)
  const feeRate = useFeeRate()

  const [showInstall, setShowInstall] = useLocalState(false)

  const totalValue =
    priceInput && amountInput
      ? (parseFloat(priceInput) * parseFloat(amountInput.replace(/,/g, ''))).toFixed(8)
      : '0.00000000'

  const handleSubmit = () => {
    const price = parseFloat(priceInput)
    const amount = parseFloat(amountInput?.replace(/,/g, '') || '0')
    if (!price || !amount) return

    if (tradeTab === 'buy') {
      // Buy BASE: give QUOTE, get BASE
      composeOrder({
        give_asset: quoteSymbol,
        give_quantity: Math.round(price * amount * 1e8),
        get_asset: baseSymbol,
        get_quantity: Math.round(amount * 1e8),
      })
    } else {
      // Sell BASE: give BASE, get QUOTE
      composeOrder({
        give_asset: baseSymbol,
        give_quantity: Math.round(amount * 1e8),
        get_asset: quoteSymbol,
        get_quantity: Math.round(price * amount * 1e8),
      })
    }
  }

  const isBusy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const price = parseFloat(priceInput)
  const amount = parseFloat(amountInput?.replace(/,/g, '') || '0')
  const isValid = price > 0 && amount > 0

  return (
    <div className="p-3 border-b border-zinc-800">
      {/* Buy/Sell toggle */}
      <div className="mb-3 flex rounded-sm overflow-hidden">
        <button
          onClick={() => setTradeTab('buy')}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            tradeTab === 'buy'
              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
              : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTradeTab('sell')}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            tradeTab === 'sell'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Stacked form inputs */}
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Price ({quoteSymbol})</label>
          <input
            type="text"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600 transition-colors font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Amount ({baseSymbol})</label>
          <input
            type="text"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
            className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
          />
        </div>

        {/* Percentage buttons */}
        <div className="flex gap-1">
          {[10, 25, 50, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => {
                if (!(spendBalance > 0)) return
                const fraction = pct / 100
                if (tradeTab === 'sell') {
                  // Sell: amount is in base asset
                  setAmountInput((spendBalance * fraction).toFixed(8).replace(/\.?0+$/, ''))
                } else {
                  // Buy: amount = quoteBalance / price
                  const p = parseFloat(priceInput)
                  if (!p || p <= 0) return
                  setAmountInput(((spendBalance * fraction) / p).toFixed(8).replace(/\.?0+$/, ''))
                }
              }}
              className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Total */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Total ({quoteSymbol})</label>
          <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
            {totalValue}
          </div>
        </div>

        {/* Fee */}
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-zinc-600">Fee rate</span>
          <span className="text-zinc-500 font-mono">
            {feeRate != null ? `~${feeRate} sat/vB` : '—'}
          </span>
        </div>

        {/* Action button */}
        {walletStatus !== 'connected' ? (
          <>
          <button
            onClick={walletStatus === 'disconnected' ? connect : () => setShowInstall(true)}
            disabled={connecting}
            className={`w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              tradeTab === 'buy'
                ? 'bg-green-500 text-zinc-950 hover:bg-green-400'
                : 'bg-red-500 text-zinc-950 hover:bg-red-400'
            } disabled:opacity-50`}
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
          </>
        ) : (
          <button
            onClick={txStatus === 'confirmed' || txStatus === 'error' ? reset : handleSubmit}
            disabled={isBusy || (txStatus === 'idle' && !isValid)}
            className={`w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              tradeTab === 'buy'
                ? 'bg-green-500 text-zinc-950 hover:bg-green-400'
                : 'bg-red-500 text-zinc-950 hover:bg-red-400'
            } disabled:opacity-50`}
          >
            {txStatus === 'confirmed'
              ? 'New Order'
              : txStatus === 'error'
                ? 'Try Again'
                : isBusy
                  ? COMPOSE_STATUS_LABELS[txStatus]
                  : tradeTab === 'buy'
                    ? `Buy ${baseSymbol}`
                    : `Sell ${baseSymbol}`}
          </button>
        )}

        {/* Tx status feedback */}
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
      </div>
    </div>
  )
}
