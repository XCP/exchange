'use client'

import { useState } from 'react'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import type { Dispenser } from '@/types/trading'

interface DispenseFormProps {
  asset: string
  sortedDispensers: Dispenser[]
  selectedIndex: number
  onSelectIndex: (i: number) => void
}

export function DispenseForm({ asset, sortedDispensers, selectedIndex, onSelectIndex }: DispenseFormProps) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('1')

  // Sell (create) form state
  const [sellPrice, setSellPrice] = useState('')
  const [sellQtyPerDispense, setSellQtyPerDispense] = useState('')
  const [sellEscrow, setSellEscrow] = useState('')

  // Buy calculations
  const selected = sortedDispensers[selectedIndex]
  const maxDispenses = selected && selected.give_quantity > 0
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

  return (
    <div className="p-3 border-b border-zinc-800">
      {/* Buy/Sell toggle */}
      <div className="mb-3 flex rounded-sm overflow-hidden">
        <button
          onClick={() => setTab('buy')}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            tab === 'buy'
              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
              : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTab('sell')}
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
                value={selectedIndex}
                onChange={(e) => onSelectIndex(Number(e.target.value))}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600 transition-colors font-mono"
              >
                {sortedDispensers.map((d, i) => (
                  <option key={d.tx_hash} value={i}>
                    {formatAmount(d.price_normalized)} BTC/ea — {formatAddress(d.source)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* BTC price per dispense (read-only) */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">BTC per Dispense</label>
            <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
              {selected ? `${formatAmount(selected.satoshi_price_normalized)} BTC` : '—'}
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
            <span className="text-zinc-600">Total BTC</span>
            <span className="text-zinc-500 font-mono">{btcCost} BTC</span>
          </div>

          {/* Connect Wallet button */}
          <button className="w-full rounded-sm bg-green-500 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-green-400 transition-colors">
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Price per token */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Price per {asset} (BTC)</label>
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
            <label className="mb-1 block text-xs text-zinc-500">Total {asset} to Escrow</label>
            <input
              type="text"
              value={sellEscrow}
              onChange={(e) => setSellEscrow(e.target.value)}
              placeholder="0"
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
            />
          </div>

          {/* BTC per dispense (calculated) */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">BTC per Dispense</label>
            <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
              {sellBtcPerDispense} BTC
            </div>
          </div>

          {/* Fee */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-zinc-600">Fee</span>
            <span className="text-zinc-500 font-mono">0.0001 BTC</span>
          </div>

          {/* Connect Wallet button */}
          <button className="w-full rounded-sm bg-red-500 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-950 hover:bg-red-400 transition-colors">
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  )
}
