'use client'

import { useState as useLocalState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { usePoolSwapQuote } from '@/lib/hooks/usePools'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'
import { formatAmount } from '@/utils/format-amount'
import { WalletInstallModal } from '@/components/wallet-install-modal'

interface TradeFormProps {
  baseSymbol: string
  quoteSymbol: string
  baseDivisible: boolean | undefined
  quoteDivisible: boolean | undefined
  tradeTab: 'buy' | 'sell'
  setTradeTab: (tab: 'buy' | 'sell') => void
  priceInput: string
  setPriceInput: (v: string) => void
  amountInput: string
  setAmountInput: (v: string) => void
}

/** Convert a human-readable amount to the raw integer the Counterparty API expects. */
function toRawQuantity(amount: number, divisible: boolean): number {
  return Math.round(amount * (divisible ? 1e8 : 1))
}

export function TradeForm({
  baseSymbol,
  quoteSymbol,
  baseDivisible,
  quoteDivisible,
  tradeTab,
  setTradeTab,
  priceInput,
  setPriceInput,
  amountInput,
  setAmountInput,
}: TradeFormProps) {
  const { status: walletStatus, address, connect, connecting } = useWallet()
  const { status: txStatus, txid, error: txError, composeOrder, reset } = useCompose()

  const spendAsset = tradeTab === 'buy' ? quoteSymbol : baseSymbol
  const feeRate = useFeeRate()

  const [showInstall, setShowInstall] = useLocalState(false)
  const [orderType, setOrderType] = useLocalState<'limit' | 'market'>('limit')

  const handleSubmit = () => {
    const price = parseFloat(priceInput)
    const amount = parseFloat(amountInput?.replace(/,/g, '') || '0')
    if (!amount || baseDivisible === undefined || quoteDivisible === undefined) return

    if (orderType === 'market') {
      if (!preview?.received) return
      if (tradeTab === 'buy') {
        composeOrder({
          give_asset: quoteSymbol,
          give_quantity: toRawQuantity(amount, quoteDivisible),
          get_asset: baseSymbol,
          get_quantity: toRawQuantity(preview.received, baseDivisible),
        })
      } else {
        composeOrder({
          give_asset: baseSymbol,
          give_quantity: toRawQuantity(amount, baseDivisible),
          get_asset: quoteSymbol,
          get_quantity: toRawQuantity(preview.received, quoteDivisible),
        })
      }
      return
    }

    if (!price) return

    if (tradeTab === 'buy') {
      // Buy BASE: give QUOTE, get BASE
      composeOrder({
        give_asset: quoteSymbol,
        give_quantity: toRawQuantity(price * amount, quoteDivisible),
        get_asset: baseSymbol,
        get_quantity: toRawQuantity(amount, baseDivisible),
      })
    } else {
      // Sell BASE: give BASE, get QUOTE
      composeOrder({
        give_asset: baseSymbol,
        give_quantity: toRawQuantity(amount, baseDivisible),
        get_asset: quoteSymbol,
        get_quantity: toRawQuantity(price * amount, quoteDivisible),
      })
    }
  }

  const isBusy = txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const price = parseFloat(priceInput)
  const amount = parseFloat(amountInput?.replace(/,/g, '') || '0')
  const isValid = orderType === 'market' ? amount > 0 : price > 0 && amount > 0

  // ── Best-execution preview: quote this order against the book + pool ──
  const [debAmount, setDebAmount] = useLocalState(amountInput)
  const [debPrice, setDebPrice] = useLocalState(priceInput)
  useEffect(() => {
    const t = setTimeout(() => setDebAmount(amountInput), 300)
    return () => clearTimeout(t)
  }, [amountInput])
  useEffect(() => {
    const t = setTimeout(() => setDebPrice(priceInput), 300)
    return () => clearTimeout(t)
  }, [priceInput])

  const dAmount = parseFloat(debAmount?.replace(/,/g, '') || '0')
  const dPrice = parseFloat(debPrice || '0')
  const receiveAsset = tradeTab === 'buy' ? baseSymbol : quoteSymbol
  const receiveDivisible = tradeTab === 'buy' ? baseDivisible : quoteDivisible
  const sellDivisible = tradeTab === 'buy' ? quoteDivisible : baseDivisible
  // What you'd sell to execute this order at market now (a buy spends price×amount of quote).
  const sellHuman = orderType === 'market' ? dAmount : tradeTab === 'buy' ? dPrice * dAmount : dAmount
  const sellQtyRaw =
    sellHuman > 0 && sellDivisible !== undefined ? toRawQuantity(sellHuman, sellDivisible) : 0
  const { quote: swapQuote } = usePoolSwapQuote(sellQtyRaw > 0 ? spendAsset : null, receiveAsset, sellQtyRaw)

  const fromRaw = (raw: number, divisible: boolean) => raw / (divisible ? 1e8 : 1)
  let preview: {
    received: number
    viaPool: boolean
    orders: number
    avgPrice: number | null
    priceImpact: number | null
    feeBps: number | null
    limitSatisfied: boolean
    status: string
    detail: string | null
  } | null = null
  if (swapQuote && sellQtyRaw > 0 && receiveDivisible !== undefined && sellDivisible !== undefined) {
    const received = fromRaw(swapQuote.estimated_output, receiveDivisible)
    const remainingInput = fromRaw(swapQuote.give_remaining, sellDivisible)
    const inputFilled = Math.max(0, sellHuman - remainingInput)
    const hasOutput = received > 0 && inputFilled > 0
    const avgPrice =
      tradeTab === 'buy'
        ? received > 0 ? inputFilled / received : null
        : inputFilled > 0 ? received / inputFilled : null
    const limitSatisfied =
      hasOutput && (orderType === 'market' || (avgPrice != null && (tradeTab === 'buy' ? avgPrice <= dPrice : avgPrice >= dPrice)))
    const desiredReceive = tradeTab === 'buy' ? dAmount : dPrice * dAmount
    const receivedPct =
      desiredReceive > 0 ? Math.max(0, Math.min(100, Math.round((received / desiredReceive) * 100))) : 0
    const inputFilledPct =
      sellHuman > 0 ? Math.max(0, Math.min(100, Math.round((inputFilled / sellHuman) * 100))) : 0

    preview = {
      received,
      viaPool: swapQuote.pool_output > 0,
      orders: swapQuote.book_orders_matched,
      avgPrice,
      priceImpact: Number.isFinite(swapQuote.price_impact) ? swapQuote.price_impact : null,
      feeBps: swapQuote.fee_bps ?? null,
      limitSatisfied,
      status: !hasOutput
        ? 'no market liquidity'
        : orderType === 'market'
        ? 'official market quote'
        : limitSatisfied
        ? tradeTab === 'buy'
          ? received >= dAmount
            ? 'market quote covers order'
            : `${receivedPct}% of target at market`
          : inputFilledPct >= 100
            ? 'market quote clears limit'
            : `${inputFilledPct}% matched at market`
        : 'market quote misses limit',
      detail: !hasOutput
        ? 'No pool or matching book orders are available for this input.'
        : orderType === 'market'
        ? null
        : limitSatisfied
        ? receivedPct < 100 && tradeTab === 'buy'
          ? 'The rest would need more spend or better liquidity.'
          : null
        : 'Official quote is market-style; partial limit fill is not reported.',
    }
  }
  const displayedPrice = orderType === 'market' && preview?.avgPrice != null ? formatAmount(preview.avgPrice) : priceInput
  const amountLabel = orderType === 'market' && tradeTab === 'buy' ? quoteSymbol : baseSymbol
  const totalValue = orderType === 'market'
    ? preview?.received != null ? preview.received.toFixed(8) : '0.00000000'
    : priceInput && amountInput
      ? (parseFloat(priceInput) * parseFloat(amountInput.replace(/,/g, ''))).toFixed(8)
      : '0.00000000'
  const totalLabel = orderType === 'market' ? `Est receive (${receiveAsset})` : `Total (${quoteSymbol})`
  const canSubmit = orderType === 'market' ? isValid && !!preview?.received : isValid

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
          <label className="mb-1 block text-xs text-zinc-500">Amount ({amountLabel})</label>
          <input
            type="text"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
            className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
          />
        </div>

        <div className="flex rounded-sm overflow-hidden">
          {(['limit', 'market'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={`flex-1 border py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                orderType === type
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Price ({quoteSymbol})</label>
          <input
            type="text"
            value={displayedPrice}
            onChange={(e) => {
              if (orderType === 'limit') setPriceInput(e.target.value)
            }}
            disabled={orderType === 'market'}
            className={`w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs outline-none transition-colors font-mono ${
              orderType === 'market'
                ? 'text-zinc-500'
                : 'text-zinc-200 focus:border-zinc-600'
            }`}
          />
        </div>

        {/* Total */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{totalLabel}</label>
          <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
            {totalValue}
          </div>
        </div>

        {/* Best-execution preview against book + pool */}
        {preview && (
          <div className="space-y-0.5 rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-[11px]">
            {orderType === 'limit' && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Full market quote</span>
                <span className="font-mono text-zinc-300">&asymp; {formatAmount(preview.received)} {receiveAsset}</span>
              </div>
            )}
            {orderType === 'limit' && preview.avgPrice != null && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Avg market price</span>
                <span className="font-mono text-zinc-300">{formatAmount(preview.avgPrice)} {quoteSymbol}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Route</span>
              <span className="text-zinc-300">
                {preview.viaPool && preview.orders > 0
                  ? `pool + ${preview.orders} order${preview.orders > 1 ? 's' : ''}`
                  : preview.viaPool
                    ? 'pool'
                    : preview.orders > 0
                      ? `${preview.orders} order${preview.orders > 1 ? 's' : ''}`
                      : 'no liquidity'}
              </span>
            </div>
            {preview.priceImpact != null && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Price impact</span>
                <span className="font-mono text-zinc-300">{preview.priceImpact.toFixed(2)}%</span>
              </div>
            )}
            {preview.feeBps != null && preview.viaPool && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Pool fee</span>
                <span className="font-mono text-zinc-300">{(preview.feeBps / 100).toFixed(2)}%</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Quote</span>
              {preview.limitSatisfied ? (
                <span className="text-green-400">{preview.status}</span>
              ) : (
                <span className="text-amber-400">&#9888; {preview.status}</span>
              )}
            </div>
            {preview.detail && (
              <div className="text-zinc-600">{preview.detail}</div>
            )}
          </div>
        )}

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
            disabled={isBusy || (txStatus === 'idle' && !canSubmit)}
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
