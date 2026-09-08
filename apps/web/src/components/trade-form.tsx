'use client'

import { useState as useLocalState, useEffect, useRef } from 'react'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'
import { usePoolSwapQuote } from '@/lib/hooks/usePools'
import { COMPOSE_STATUS_LABELS } from '@/utils/constants'
import { formatAmount } from '@/utils/format-amount'
import { toBase, totalToBase, fromBaseNumber, fromBase, rawErrorMessage, big, num } from '@/utils/numeric'
import { serializeRawInteger } from '@xcp/wallet-sdk/amounts'
import { useConnectFlow } from '@/lib/wallet/useConnectFlow'

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
  const { status: walletStatus } = useWallet()
  const wallet = useConnectFlow()
  const { status: txStatus, txid, error: txError, composeOrder, reset } = useCompose()

  const spendAsset = tradeTab === 'buy' ? quoteSymbol : baseSymbol
  const feeRate = useFeeRate()

  const [orderType, setOrderType] = useLocalState<'limit' | 'market'>('limit')
  const [preparing, setPreparing] = useLocalState(false)
  const [quoteChanged, setQuoteChanged] = useLocalState(false)
  const intentVersion = useRef(0)
  useEffect(() => { intentVersion.current++ }, [amountInput, priceInput, orderType, tradeTab, baseSymbol, quoteSymbol, baseDivisible, quoteDivisible, walletStatus])

  const typedDivisible = orderType === 'market' && tradeTab === 'buy' ? quoteDivisible : baseDivisible
  const amountResult = toBase(amountInput, typedDivisible)
  const totalResult = totalToBase(priceInput, amountInput, quoteDivisible, tradeTab === 'sell' ? 'ceil' : 'floor')
  const handleSubmit = async () => {
    if (!canSubmit || !amountResult.ok) return
    if (orderType === 'market') {
      if (!swapQuote) return
      const minimum = serializeRawInteger(swapQuote.estimated_output, { min: 1n })
      const version = intentVersion.current
      setPreparing(true)
      try {
        const fresh = await refreshQuote()
        if (version !== intentVersion.current) return
        if (!fresh || big(fresh.estimated_output).isLessThan(minimum)) { setQuoteChanged(true); return }
      } catch { setQuoteChanged(true); return } finally { setPreparing(false) }
      setQuoteChanged(false)
      composeOrder({
        give_asset: spendAsset, give_quantity: amountResult.base,
        get_asset: receiveAsset, get_quantity: minimum,
      })
      return
    }
    if (!totalResult.ok) return
    composeOrder({
      give_asset: tradeTab === 'buy' ? quoteSymbol : baseSymbol,
      give_quantity: tradeTab === 'buy' ? totalResult.base : amountResult.base,
      get_asset: tradeTab === 'buy' ? baseSymbol : quoteSymbol,
      get_quantity: tradeTab === 'buy' ? amountResult.base : totalResult.base,
    })
  }
  const isBusy = preparing || txStatus === 'composing' || txStatus === 'signing' || txStatus === 'broadcasting'
  const isValid = amountResult.ok && amountResult.base !== '0' &&
    (orderType === 'market' || (totalResult.ok && totalResult.base !== '0'))

  // ── Best-execution preview: quote this order against the book + pool ──
  const [debAmount, setDebAmount] = useLocalState(amountInput)
  const [debPrice, setDebPrice] = useLocalState(priceInput)
  useEffect(() => {
    const t = setTimeout(() => setDebAmount(amountInput), 300)
    return () => clearTimeout(t)
  }, [amountInput, setDebAmount])
  useEffect(() => {
    const t = setTimeout(() => setDebPrice(priceInput), 300)
    return () => clearTimeout(t)
  }, [priceInput, setDebPrice])

  const dAmount = num(debAmount)
  const dPrice = num(debPrice)
  const receiveAsset = tradeTab === 'buy' ? baseSymbol : quoteSymbol
  const receiveDivisible = tradeTab === 'buy' ? baseDivisible : quoteDivisible
  const sellDivisible = tradeTab === 'buy' ? quoteDivisible : baseDivisible
  const debResult = toBase(debAmount, typedDivisible)
  const debTotal = totalToBase(debPrice, debAmount, quoteDivisible, tradeTab === 'sell' ? 'ceil' : 'floor')
  const inputsCurrent = debAmount === amountInput && (orderType === 'market' || debPrice === priceInput)
  const sellQtyBase = isValid && inputsCurrent && debResult.ok
    ? orderType === 'limit' && tradeTab === 'buy' ? debTotal.ok ? debTotal.base : null : debResult.base
    : null
  const sellQtyRaw = sellQtyBase ? num(sellQtyBase) : 0
  const sellHuman = fromBaseNumber(sellQtyBase ?? '0', sellDivisible)
  const { quote: swapQuote, isLoading: quoteLoading, isValidating: quoteValidating, error: quoteError, refreshQuote } = usePoolSwapQuote(sellQtyBase ? spendAsset : null, receiveAsset, sellQtyBase)

  const fromRaw = (raw: number | string, divisible: boolean) => fromBaseNumber(raw, divisible)
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
            ? 'max spend clears limit'
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
    ? swapQuote ? fromBase(swapQuote.estimated_output, receiveDivisible) : ''
    : priceInput && amountInput
      ? big(priceInput).times(big(amountInput)).toFixed(8)
      : '0.00000000'
  const totalLabel = orderType === 'market' ? `Est receive (${receiveAsset})` : `Total (${quoteSymbol})`
  const canSubmit = !isBusy && isValid && (orderType !== 'market' || (inputsCurrent && !quoteLoading && !quoteValidating && !quoteError && !!preview?.received))

  return (
    <div className="p-3 border-b border-zinc-800">
      {amountInput && !amountResult.ok && <p role="alert" className="mb-2 text-xs text-amber-400">{rawErrorMessage(amountResult.error, orderType === 'market' ? spendAsset : baseSymbol)}</p>}
      {orderType === 'limit' && priceInput && !totalResult.ok && <p role="alert" className="mb-2 text-xs text-amber-400">{rawErrorMessage(totalResult.error, quoteSymbol)}</p>}
      {isValid && <p className="mb-2 break-all text-xs text-zinc-400">{orderType === 'limit' && totalResult.ok ? 'Order total: ' + fromBase(totalResult.base, quoteDivisible) + ' ' + quoteSymbol : ''}</p>}
      {orderType === 'market' && isValid && amountResult.ok && swapQuote && <p className="mb-2 break-all text-xs text-zinc-400">Spend {fromBase(amountResult.base, typedDivisible)} {spendAsset}; receive at least {fromBase(swapQuote.estimated_output, receiveDivisible)} {receiveAsset}.</p>}
      {quoteChanged && <p role="alert" className="mb-2 text-xs text-amber-400">The quote changed or could not be reconfirmed. Review the latest amounts before submitting.</p>}
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
            aria-label={`Amount (${amountLabel})`}
            aria-invalid={amountInput !== '' && !amountResult.ok}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            onPaste={(event) => {
              event.preventDefault()
              const start = event.currentTarget.selectionStart ?? amountInput.length
              const end = event.currentTarget.selectionEnd ?? start
              setAmountInput(amountInput.slice(0, start) + event.clipboardData.getData('text') + amountInput.slice(end))
            }}
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
            aria-label={`Price (${quoteSymbol})`}
            value={displayedPrice}
            onChange={(e) => {
              if (orderType === 'limit') setPriceInput(e.target.value)
            }}
            onPaste={(event) => {
              if (orderType !== 'limit') return
              event.preventDefault()
              const start = event.currentTarget.selectionStart ?? priceInput.length
              const end = event.currentTarget.selectionEnd ?? start
              setPriceInput(priceInput.slice(0, start) + event.clipboardData.getData('text') + priceInput.slice(end))
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
                <span className="text-zinc-500">{tradeTab === 'buy' ? 'Max-spend quote' : 'Full sell quote'}</span>
                <span className="font-mono text-zinc-300">&asymp; {formatAmount(preview.received)} {receiveAsset}</span>
              </div>
            )}
            {orderType === 'limit' && tradeTab === 'buy' && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Target amount</span>
                <span className="font-mono text-zinc-300">{formatAmount(dAmount)} {baseSymbol}</span>
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
            onClick={wallet.start}
            disabled={wallet.connecting}
            className={`w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              tradeTab === 'buy'
                ? 'bg-green-500 text-zinc-950 hover:bg-green-400'
                : 'bg-red-500 text-zinc-950 hover:bg-red-400'
            } disabled:opacity-50`}
          >
            {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {wallet.walletModal}
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
