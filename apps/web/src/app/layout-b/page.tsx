'use client'

import React, { useState } from 'react'

// -- Mock Data ----------------------------------------------------------------

const asks = [
  { price: '0.00000450', amount: '125,000', total: '0.5625' },
  { price: '0.00000448', amount: '89,000', total: '0.3987' },
  { price: '0.00000445', amount: '250,000', total: '1.1125' },
  { price: '0.00000442', amount: '67,000', total: '0.2961' },
  { price: '0.00000440', amount: '180,000', total: '0.7920' },
  { price: '0.00000435', amount: '340,000', total: '1.4790' },
  { price: '0.00000432', amount: '95,000', total: '0.4104' },
  { price: '0.00000430', amount: '500,000', total: '2.1500' },
]

const bids = [
  { price: '0.00000420', amount: '200,000', total: '0.8400' },
  { price: '0.00000418', amount: '150,000', total: '0.6270' },
  { price: '0.00000415', amount: '88,000', total: '0.3652' },
  { price: '0.00000410', amount: '420,000', total: '1.7220' },
  { price: '0.00000405', amount: '175,000', total: '0.7088' },
  { price: '0.00000400', amount: '600,000', total: '2.4000' },
  { price: '0.00000395', amount: '95,000', total: '0.3753' },
  { price: '0.00000390', amount: '310,000', total: '1.2090' },
]

const recentTrades = [
  { price: '0.00000420', amount: '15,000', time: '2m ago', side: 'buy' },
  { price: '0.00000422', amount: '8,500', time: '5m ago', side: 'sell' },
  { price: '0.00000420', amount: '45,000', time: '8m ago', side: 'buy' },
  { price: '0.00000418', amount: '12,000', time: '12m ago', side: 'buy' },
  { price: '0.00000425', amount: '5,000', time: '15m ago', side: 'sell' },
  { price: '0.00000420', amount: '100,000', time: '22m ago', side: 'buy' },
  { price: '0.00000415', amount: '25,000', time: '35m ago', side: 'buy' },
  { price: '0.00000428', amount: '7,500', time: '42m ago', side: 'sell' },
  { price: '0.00000420', amount: '50,000', time: '1h ago', side: 'buy' },
  { price: '0.00000410', amount: '30,000', time: '1h ago', side: 'buy' },
  { price: '0.00000430', amount: '18,000', time: '2h ago', side: 'sell' },
  { price: '0.00000415', amount: '60,000', time: '2h ago', side: 'buy' },
  { price: '0.00000420', amount: '22,000', time: '3h ago', side: 'buy' },
  { price: '0.00000435', amount: '9,000', time: '3h ago', side: 'sell' },
  { price: '0.00000418', amount: '40,000', time: '4h ago', side: 'buy' },
]

const holders = [
  { address: '1Pe7...k8Fd', balance: '125,000,000', pct: '12.50%', tag: '' },
  { address: '1A1z...xY9m', balance: '89,420,000', pct: '8.94%', tag: '' },
  { address: 'bc1q...7w3p', balance: '67,100,000', pct: '6.71%', tag: '' },
  { address: '1Bvr...nNpJ', balance: '45,800,000', pct: '4.58%', tag: '' },
  { address: '1Cou...pVr', balance: '38,200,000', pct: '3.82%', tag: 'Burn' },
  { address: 'bc1q...f9k2', balance: '22,500,000', pct: '2.25%', tag: '' },
  { address: '1J9u...RtY4', balance: '18,900,000', pct: '1.89%', tag: '' },
  { address: '1Kf3...wQ7x', balance: '15,300,000', pct: '1.53%', tag: '' },
]

const markets = [
  { pair: 'PEPECASH/BTC', price: '0.00000001', change: '+2.1%', volume: '0.045 BTC', positive: true },
  { pair: 'PEPECASH/FLDC', price: '125.00', change: '-1.3%', volume: '8,420 FLDC', positive: false },
  { pair: 'PEPECASH/BITCRYSTALS', price: '0.85', change: '+0.5%', volume: '1,200 BCY', positive: true },
]

const chartBars = [
  { open: 38, close: 42 },
  { open: 42, close: 40 },
  { open: 40, close: 44 },
  { open: 44, close: 43 },
  { open: 43, close: 41 },
  { open: 41, close: 39 },
  { open: 39, close: 36 },
  { open: 36, close: 38 },
  { open: 38, close: 35 },
  { open: 35, close: 37 },
  { open: 37, close: 40 },
  { open: 40, close: 42 },
  { open: 42, close: 45 },
  { open: 45, close: 43 },
  { open: 43, close: 46 },
  { open: 46, close: 48 },
  { open: 48, close: 44 },
  { open: 44, close: 42 },
  { open: 42, close: 45 },
  { open: 45, close: 47 },
  { open: 47, close: 44 },
  { open: 44, close: 46 },
  { open: 46, close: 42 },
  { open: 42, close: 42 },
]

const volumes = [45, 72, 38, 90, 55, 68, 82, 30, 95, 42, 60, 75, 88, 50, 65, 100, 78, 35, 58, 92, 48, 70, 55, 40]

// -- Component ----------------------------------------------------------------

export default function TradePageLayoutB() {
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>('buy')
  const [dataTab, setDataTab] = useState<'trades' | 'holders' | 'markets'>('trades')
  const [mobileDataTab, setMobileDataTab] = useState<'book' | 'trades' | 'holders' | 'markets'>('book')
  const [priceInput, setPriceInput] = useState('0.00000420')
  const [amountInput, setAmountInput] = useState('')

  const totalValue =
    priceInput && amountInput
      ? (parseFloat(priceInput) * parseFloat(amountInput.replace(/,/g, ''))).toFixed(8)
      : '0.00000000'

  const maxAskTotal = Math.max(...asks.map((a) => parseFloat(a.total)))
  const maxBidTotal = Math.max(...bids.map((b) => parseFloat(b.total)))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* -- Top Bar --------------------------------------------------------- */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold tracking-wider text-green-500 font-mono">
            XCP DEX
          </span>
          <nav className="hidden sm:flex items-center gap-4">
            {['Markets', 'Trade', 'Orders', 'Dispensers'].map((link) => (
              <a
                key={link}
                href="#"
                className={`text-xs font-medium transition-colors hover:text-zinc-100 ${
                  link === 'Trade' ? 'text-zinc-100' : 'text-zinc-500'
                }`}
              >
                {link}
              </a>
            ))}
          </nav>
        </div>

        {/* Search -- full input on sm+, icon-only on mobile */}
        <div className="hidden sm:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search markets..."
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-10 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-900/80"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-px text-[10px] font-mono text-zinc-500">
              /
            </kbd>
          </div>
        </div>
        <button className="sm:hidden flex items-center justify-center h-7 w-7 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>

        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-zinc-500">BTC</span>
            <span className="text-xs text-zinc-300 font-mono">$97,428.00</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Block</span>
            <span className="text-xs text-zinc-300 font-mono">886,241</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-xs text-zinc-500">Synced</span>
          </div>
        </div>
      </header>

      {/* -- Market Header --------------------------------------------------- */}
      <div className="sticky top-[37px] z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-zinc-800 text-xs font-bold text-green-400 max-sm:h-6 max-sm:w-6">
              PC
            </div>
            <div>
              <h1 className="text-sm font-semibold text-zinc-100">PEPECASH / XCP</h1>
              <span className="text-xs text-zinc-500 max-sm:hidden">Counterparty DEX</span>
            </div>
          </div>
          <div className="h-8 w-px bg-zinc-800 max-sm:hidden" />
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-zinc-100 font-mono max-sm:text-base">
              0.00000420
            </span>
            <span className="text-xs text-zinc-500">XCP</span>
            <span className="text-xs text-zinc-400 max-sm:hidden">($0.0031)</span>
          </div>
          <span className="rounded-sm bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
            +5.2%
          </span>
          <div className="h-8 w-px bg-zinc-800 max-md:hidden" />
          <div className="hidden md:flex gap-5">
            <div>
              <div className="text-xs text-zinc-500">24h High</div>
              <div className="text-xs text-zinc-300 font-mono">0.00000450</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">24h Low</div>
              <div className="text-xs text-zinc-300 font-mono">0.00000390</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">24h Vol</div>
              <div className="text-xs text-zinc-300 font-mono">3.42 XCP</div>
            </div>
          </div>
        </div>
      </div>

      {/* -- Main Grid ------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-zinc-800">

        {/* -- LEFT COLUMN: Trade Form + Order Summary (lg:col-span-3) --------
             On mobile this appears after the chart (order-2 on mobile via the
             mobile flow below). On desktop it's the first column (lg:order-1).
        -------------------------------------------------------------------- */}
        <div className="order-2 lg:order-1 col-span-1 lg:col-span-3 bg-zinc-950 flex flex-col">
          {/* Trade Panel */}
          <div className="p-3">
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

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Price (XCP)</label>
                <input
                  type="text"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Amount (PEPECASH)</label>
                <input
                  type="text"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors font-mono"
                />
              </div>

              <div className="flex gap-1">
                {['25%', '50%', '75%', '100%'].map((pct) => (
                  <button
                    key={pct}
                    className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    {pct}
                  </button>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Total (XCP)</label>
                <div className="w-full rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
                  {totalValue}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-zinc-600">Fee</span>
                <span className="text-zinc-500 font-mono">0.0001 BTC</span>
              </div>

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

          {/* Order Summary -- quick reference below the trade form */}
          <div className="mx-3 mb-3 rounded-sm bg-zinc-900/50 border border-zinc-800 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Order Summary
            </h3>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Best Ask</span>
                <span className="text-red-400 font-mono">0.00000430</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Best Bid</span>
                <span className="text-green-400 font-mono">0.00000420</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Spread</span>
                <span className="text-zinc-400 font-mono">0.00000010 (2.38%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* -- CENTER COLUMN: Chart + Tabbed Data (lg:col-span-6) -------------
             On mobile the chart is first (order-1). The tabbed data section
             is handled through the mobile tab bar further below.
        -------------------------------------------------------------------- */}
        <div className="order-1 lg:order-2 col-span-1 lg:col-span-6 bg-zinc-950 flex flex-col">
          {/* Chart Area */}
          <div className="flex-1 border-b border-zinc-800">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-zinc-300 max-sm:hidden">PEPECASH/XCP</span>
                <div className="flex items-center gap-0.5">
                  {['1H', '4H', '1D', '1W', '1M'].map((tf) => (
                    <button
                      key={tf}
                      className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                        tf === '1D'
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 max-sm:hidden">
                <span className="text-xs text-zinc-600">O</span>
                <span className="text-xs text-zinc-300 font-mono">420</span>
                <span className="text-xs text-zinc-600">H</span>
                <span className="text-xs text-zinc-300 font-mono">450</span>
                <span className="text-xs text-zinc-600">L</span>
                <span className="text-xs text-zinc-300 font-mono">390</span>
                <span className="text-xs text-zinc-600">C</span>
                <span className="text-xs text-green-400 font-mono">420</span>
              </div>
            </div>

            {/* Chart visualization */}
            <div className="relative px-4 py-4 max-sm:px-2" style={{ minHeight: '240px' }}>
              {/* Y-axis labels */}
              <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between w-8 max-sm:w-6">
                {['450', '440', '430', '420', '410', '400', '390'].map((label) => (
                  <span
                    key={label}
                    className="text-right pr-1 text-zinc-700 font-mono"
                    style={{ fontSize: '9px' }}
                  >
                    {label}
                  </span>
                ))}
              </div>

              {/* Grid lines */}
              <div className="absolute left-8 right-4 top-4 bottom-4 max-sm:left-6 max-sm:right-2">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={`grid-${i}`}
                    className="absolute left-0 right-0 border-t border-zinc-900"
                    style={{ top: `${(i / 6) * 100}%` }}
                  />
                ))}
              </div>

              {/* Candlestick bars */}
              <div className="absolute left-10 right-4 top-4 bottom-4 flex items-end gap-0.5 max-sm:left-7 max-sm:right-2">
                {chartBars.map((bar, i) => {
                  const min = 34
                  const max = 50
                  const range = max - min
                  const barBottom = ((Math.min(bar.open, bar.close) - min) / range) * 100
                  const barHeight = (Math.abs(bar.close - bar.open) / range) * 100
                  const isGreen = bar.close >= bar.open
                  const wickTop = ((Math.max(bar.open, bar.close) - min) / range) * 100
                  const wickBottom = barBottom

                  return (
                    <div key={`bar-${i}`} className="relative flex-1" style={{ height: '100%' }}>
                      <div
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{
                          bottom: `${wickBottom}%`,
                          height: `${wickTop - wickBottom + Math.max(barHeight, 2)}%`,
                          width: '1px',
                          backgroundColor: isGreen ? '#22c55e' : '#ef4444',
                          opacity: 0.5,
                        }}
                      />
                      <div
                        className="absolute left-0.5 right-0.5"
                        style={{
                          bottom: `${barBottom}%`,
                          height: `${Math.max(barHeight, 2)}%`,
                          backgroundColor: isGreen ? '#22c55e' : '#ef4444',
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* Current price line */}
              <div className="absolute left-8 right-4 max-sm:left-6 max-sm:right-2" style={{ top: '50%' }}>
                <div className="border-t border-dashed border-green-500/40" />
              </div>

              {/* Volume bars */}
              <div
                className="absolute left-10 right-4 bottom-4 flex items-end gap-0.5 max-sm:left-7 max-sm:right-2"
                style={{ height: '20%' }}
              >
                {chartBars.map((bar, i) => {
                  const vol = volumes[i] || 50
                  const isGreen = bar.close >= bar.open
                  return (
                    <div key={`vol-${i}`} className="relative flex-1" style={{ height: '100%' }}>
                      <div
                        className="absolute bottom-0 left-0.5 right-0.5"
                        style={{
                          height: `${vol}%`,
                          backgroundColor: isGreen ? '#22c55e' : '#ef4444',
                          opacity: 0.15,
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tabbed Data Section (desktop only -- Trades | Holders | Markets) */}
          <div className="hidden lg:block">
            <div className="flex border-b border-zinc-800">
              {(['trades', 'holders', 'markets'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDataTab(tab)}
                  className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    dataTab === tab
                      ? 'text-zinc-100 border-b-2 border-green-500'
                      : 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {tab === 'trades' ? 'Trades' : tab === 'holders' ? 'Holders' : 'Markets'}
                </button>
              ))}
            </div>

            {/* Trades tab content */}
            {dataTab === 'trades' && (
              <div>
                <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600">
                  <span>Price (XCP)</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Time</span>
                </div>
                <div className="px-1">
                  {recentTrades.map((trade, i) => (
                    <div
                      key={`trade-${i}`}
                      className="grid grid-cols-3 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-default"
                    >
                      <span
                        className={`font-mono ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {trade.price}
                      </span>
                      <span className="text-right text-zinc-400 font-mono">{trade.amount}</span>
                      <span className="text-right text-zinc-600 font-mono">{trade.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Holders tab content */}
            {dataTab === 'holders' && (
              <div>
                <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600">
                  <span>Address</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">% Supply</span>
                </div>
                <div className="px-1">
                  {holders.map((holder, i) => (
                    <div
                      key={`holder-${i}`}
                      className="grid grid-cols-3 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-default"
                    >
                      <span className="text-zinc-300 font-mono">
                        {holder.address}
                        {holder.tag && (
                          <span className="ml-1.5 text-zinc-600">({holder.tag})</span>
                        )}
                      </span>
                      <span className="text-right text-zinc-400 font-mono">{holder.balance}</span>
                      <span className="text-right text-zinc-500 font-mono">{holder.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Markets tab content */}
            {dataTab === 'markets' && (
              <div>
                <div className="grid grid-cols-4 gap-0 px-3 py-1.5 text-xs text-zinc-600">
                  <span>Pair</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">24h Change</span>
                  <span className="text-right">Volume</span>
                </div>
                <div className="px-1">
                  {markets.map((market, i) => (
                    <div
                      key={`market-${i}`}
                      className="grid grid-cols-4 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-pointer"
                    >
                      <span className="text-zinc-300 font-mono">{market.pair}</span>
                      <span className="text-right text-zinc-400 font-mono">{market.price}</span>
                      <span
                        className={`text-right font-mono ${
                          market.positive ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {market.change}
                      </span>
                      <span className="text-right text-zinc-500 font-mono">{market.volume}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* -- Mobile Data Tab Bar -------------------------------------------
             Only visible below lg. Lets users toggle between book, trades,
             holders, and markets.
        -------------------------------------------------------------------- */}
        <div className="order-3 lg:hidden bg-zinc-950 flex border-b border-zinc-800">
          {(['book', 'trades', 'holders', 'markets'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileDataTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                mobileDataTab === tab
                  ? 'text-zinc-100 border-b-2 border-green-500'
                  : 'text-zinc-500 border-b-2 border-transparent'
              }`}
            >
              {tab === 'book' ? 'Order Book' : tab === 'trades' ? 'Trades' : tab === 'holders' ? 'Holders' : 'Markets'}
            </button>
          ))}
        </div>

        {/* -- RIGHT COLUMN: Order Book (lg:col-span-3) ----------------------
             Always visible on desktop. On mobile, toggled via mobileDataTab.
        -------------------------------------------------------------------- */}
        <div className={`order-4 lg:order-3 col-span-1 lg:col-span-3 bg-zinc-950 ${
          mobileDataTab !== 'book' ? 'hidden lg:block' : ''
        }`}>
          <div className="border-b border-zinc-800 px-3 py-2 hidden lg:block">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Order Book
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600">
            <span>Price (XCP)</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Total (XCP)</span>
          </div>

          {/* Asks */}
          <div className="px-1">
            {asks.map((ask, i) => {
              const depthPct = (parseFloat(ask.total) / maxAskTotal) * 100
              return (
                <div
                  key={`ask-${i}`}
                  className="relative grid grid-cols-3 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-pointer"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-red-500/10"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative z-10 text-red-400 font-mono">{ask.price}</span>
                  <span className="relative z-10 text-right text-zinc-400 font-mono">
                    {ask.amount}
                  </span>
                  <span className="relative z-10 text-right text-zinc-500 font-mono">
                    {ask.total}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Spread */}
          <div className="flex items-center justify-between border-y border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
            <span className="text-xs text-zinc-500">Spread</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-300 font-mono">0.00000010</span>
              <span className="text-xs text-zinc-600">(0.24%)</span>
            </div>
          </div>

          {/* Bids */}
          <div className="px-1">
            {bids.map((bid, i) => {
              const depthPct = (parseFloat(bid.total) / maxBidTotal) * 100
              return (
                <div
                  key={`bid-${i}`}
                  className="relative grid grid-cols-3 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-pointer"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-green-500/10"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative z-10 text-green-400 font-mono">{bid.price}</span>
                  <span className="relative z-10 text-right text-zinc-400 font-mono">
                    {bid.amount}
                  </span>
                  <span className="relative z-10 text-right text-zinc-500 font-mono">
                    {bid.total}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* -- Mobile: Trades content (toggled via mobileDataTab) ------------ */}
        <div className={`order-5 lg:hidden col-span-1 bg-zinc-950 ${
          mobileDataTab !== 'trades' ? 'hidden' : ''
        }`}>
          <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600">
            <span>Price (XCP)</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Time</span>
          </div>
          <div className="px-1">
            {recentTrades.map((trade, i) => (
              <div
                key={`mtrade-${i}`}
                className="grid grid-cols-3 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-default"
              >
                <span
                  className={`font-mono ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {trade.price}
                </span>
                <span className="text-right text-zinc-400 font-mono">{trade.amount}</span>
                <span className="text-right text-zinc-600 font-mono">{trade.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* -- Mobile: Holders content (toggled via mobileDataTab) ----------- */}
        <div className={`order-6 lg:hidden col-span-1 bg-zinc-950 ${
          mobileDataTab !== 'holders' ? 'hidden' : ''
        }`}>
          <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600">
            <span>Address</span>
            <span className="text-right">Balance</span>
            <span className="text-right">% Supply</span>
          </div>
          <div className="px-1">
            {holders.map((holder, i) => (
              <div
                key={`mholder-${i}`}
                className="grid grid-cols-3 gap-0 px-2 py-px text-xs hover:bg-zinc-900 cursor-default"
              >
                <span className="text-zinc-300 font-mono">
                  {holder.address}
                  {holder.tag && (
                    <span className="ml-1.5 text-zinc-600">({holder.tag})</span>
                  )}
                </span>
                <span className="text-right text-zinc-400 font-mono">{holder.balance}</span>
                <span className="text-right text-zinc-500 font-mono">{holder.pct}</span>
              </div>
            ))}
          </div>
        </div>

        {/* -- Mobile: Markets content (toggled via mobileDataTab) ----------- */}
        <div className={`order-7 lg:hidden col-span-1 bg-zinc-950 ${
          mobileDataTab !== 'markets' ? 'hidden' : ''
        }`}>
          <div className="grid grid-cols-4 gap-0 px-3 py-1.5 text-xs text-zinc-600">
            <span>Pair</span>
            <span className="text-right">Price</span>
            <span className="text-right">24h Change</span>
            <span className="text-right">Volume</span>
          </div>
          <div className="px-1">
            {markets.map((market, i) => (
              <div
                key={`mmarket-${i}`}
                className="grid grid-cols-4 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-pointer"
              >
                <span className="text-zinc-300 font-mono">{market.pair}</span>
                <span className="text-right text-zinc-400 font-mono">{market.price}</span>
                <span
                  className={`text-right font-mono ${
                    market.positive ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {market.change}
                </span>
                <span className="text-right text-zinc-500 font-mono">{market.volume}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* -- Bottom: Market Stats Bar ---------------------------------------- */}
      <div className="border-t border-zinc-800">
        <div className="flex flex-wrap items-center divide-x divide-zinc-800">
          {[
            { label: 'Market Cap', value: '$3.1M' },
            { label: 'Total Supply', value: '1,000,000,000' },
            { label: '7d Volume', value: '12.5 XCP ($93.75)' },
            { label: '30d Volume', value: '89.2 XCP ($669.00)' },
            { label: 'Holders', value: '4,521' },
            { label: 'Divisible', value: 'Yes', accent: true },
            { label: 'Locked', value: 'Yes', accent: true },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 px-4 py-2.5">
              <span className="text-xs text-zinc-600">{stat.label}</span>
              <span
                className={`text-xs font-mono ${stat.accent ? 'text-green-400' : 'text-zinc-300'}`}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
