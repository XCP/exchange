'use client'

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

  const totalValue =
    priceInput && amountInput
      ? (parseFloat(priceInput) * parseFloat(amountInput.replace(/,/g, ''))).toFixed(8)
      : '0.00000000'

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
          {['10%', '25%', '50%', '100%'].map((pct) => (
            <button
              key={pct}
              className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
            >
              {pct}
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
          <span className="text-zinc-600">Fee</span>
          <span className="text-zinc-500 font-mono">0.0001 BTC</span>
        </div>

        {/* Connect Wallet button */}
        <button
          className={`w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            tradeTab === 'buy'
              ? 'bg-green-500 text-zinc-950 hover:bg-green-400'
              : 'bg-red-500 text-zinc-950 hover:bg-red-400'
          }`}
        >
          Connect Wallet
        </button>
      </div>
    </div>
  )
}
