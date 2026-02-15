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

// -- Component ----------------------------------------------------------------

export default function TradePageLayoutG() {
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>('buy')
  const [dataTab, setDataTab] = useState<'trades' | 'holders' | 'markets' | 'orders'>('trades')
  const [mobileDataTab, setMobileDataTab] = useState<'trades' | 'holders' | 'markets' | 'book' | 'orders'>('trades')
  const [priceInput, setPriceInput] = useState('0.00000420')
  const [amountInput, setAmountInput] = useState('')

  const totalValue =
    priceInput && amountInput
      ? (parseFloat(priceInput) * parseFloat(amountInput.replace(/,/g, ''))).toFixed(8)
      : '0.00000000'

  const maxAskTotal = Math.max(...asks.map((a) => parseFloat(a.total)))
  const maxBidTotal = Math.max(...bids.map((b) => parseFloat(b.total)))

  // Top 5 asks sorted descending by price (highest first)
  const sidebarAsks = [...asks].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5)
  // Top 5 bids sorted descending by price (highest first)
  const sidebarBids = [...bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5)

  // -- Compact Sidebar Order Book (always visible on desktop) --
  const CompactOrderBook = () => (
    <div>
      {/* Header */}
      <div className="grid grid-cols-3 gap-0 px-3 py-1 text-[10px] text-zinc-600 border-b border-zinc-800">
        <span>Price</span>
        <span className="text-right">Amt</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (descending by price) */}
      <div className="px-1">
        {sidebarAsks.map((ask, i) => {
          const depthPct = (parseFloat(ask.total) / maxAskTotal) * 100
          return (
            <div
              key={`ask-${i}`}
              className="relative grid grid-cols-3 gap-0 px-2 py-px text-[10px] hover:bg-zinc-900 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 right-0 bg-red-500/10"
                style={{ width: `${depthPct}%` }}
              />
              <span className="relative z-10 text-red-400 font-mono">{ask.price}</span>
              <span className="relative z-10 text-right text-zinc-400 font-mono">{ask.amount}</span>
              <span className="relative z-10 text-right text-zinc-500 font-mono">{ask.total}</span>
            </div>
          )
        })}
      </div>

      {/* Spread bar */}
      <div className="flex items-center justify-between border-y border-zinc-800 bg-zinc-900/50 px-3 py-1">
        <span className="text-[10px] text-zinc-500">Spread</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-zinc-300 font-mono">0.00000010</span>
          <span className="text-[10px] text-zinc-600">(0.24%)</span>
        </div>
      </div>

      {/* Bids (descending by price) */}
      <div className="px-1">
        {sidebarBids.map((bid, i) => {
          const depthPct = (parseFloat(bid.total) / maxBidTotal) * 100
          return (
            <div
              key={`bid-${i}`}
              className="relative grid grid-cols-3 gap-0 px-2 py-px text-[10px] hover:bg-zinc-900 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 right-0 bg-green-500/10"
                style={{ width: `${depthPct}%` }}
              />
              <span className="relative z-10 text-green-400 font-mono">{bid.price}</span>
              <span className="relative z-10 text-right text-zinc-400 font-mono">{bid.amount}</span>
              <span className="relative z-10 text-right text-zinc-500 font-mono">{bid.total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  // -- Vertical Order Book (for mobile tab) --
  const VerticalOrderBook = () => (
    <div>
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
              <span className="relative z-10 text-right text-zinc-400 font-mono">{ask.amount}</span>
              <span className="relative z-10 text-right text-zinc-500 font-mono">{ask.total}</span>
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
              <span className="relative z-10 text-right text-zinc-400 font-mono">{bid.amount}</span>
              <span className="relative z-10 text-right text-zinc-500 font-mono">{bid.total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  // -- Trades List --
  const TradesList = () => (
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
            <span className={`font-mono ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {trade.price}
            </span>
            <span className="text-right text-zinc-400 font-mono">{trade.amount}</span>
            <span className="text-right text-zinc-600 font-mono">{trade.time}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // -- Orders (empty state) --
  const OrdersEmpty = () => (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <svg className="h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <span className="text-xs text-zinc-500">Connect your wallet to view orders</span>
      <a href="#" className="text-xs font-medium text-green-400 hover:text-green-300 transition-colors">
        Connect Wallet
      </a>
    </div>
  )

  // -- Holders Table --
  const HoldersTable = () => (
    <div>
      <div className="grid grid-cols-3 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800">
        <span>Address</span>
        <span className="text-right">Balance</span>
        <span className="text-right">% Supply</span>
      </div>
      <div className="px-1">
        {holders.map((holder, i) => (
          <div
            key={`holder-${i}`}
            className="grid grid-cols-3 gap-0 px-2 py-1 text-xs hover:bg-zinc-900 cursor-default"
          >
            <span className="text-zinc-400 font-mono">{holder.address}</span>
            <span className="text-right text-zinc-400 font-mono">{holder.balance}</span>
            <span className="text-right text-zinc-500 font-mono">
              {holder.pct}
              {holder.tag && (
                <span className="ml-1.5 text-yellow-500/80">({holder.tag})</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Markets Table ──
  const MarketsTable = () => (
    <div>
      <div className="grid grid-cols-4 gap-0 px-3 py-1.5 text-xs text-zinc-600 border-b border-zinc-800">
        <span>Pair</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h Vol</span>
        <span className="text-right">24h %</span>
      </div>
      <div className="px-1">
        {[
          { pair: 'PEPECASH / XCP', price: '0.00000420', vol: '3.42 XCP', change: '+5.2%', up: true },
          { pair: 'PEPECASH / BTC', price: '0.00000003', vol: '0.08 BTC', change: '+4.8%', up: true },
          { pair: 'PEPECASH / FLDC', price: '12.50', vol: '125K FLDC', change: '-1.2%', up: false },
        ].map((m, i) => (
          <div
            key={`market-${i}`}
            className="grid grid-cols-4 gap-0 px-2 py-1.5 text-xs hover:bg-zinc-900 cursor-pointer"
          >
            <span className="text-zinc-300 font-mono">{m.pair}</span>
            <span className="text-right text-zinc-400 font-mono">{m.price}</span>
            <span className="text-right text-zinc-500 font-mono">{m.vol}</span>
            <span className={`text-right font-mono ${m.up ? 'text-green-400' : 'text-red-400'}`}>{m.change}</span>
          </div>
        ))}
      </div>
    </div>
  )

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

      {/* -- Mobile: Condensed Market Info ----------------------------------- */}
      <div className="lg:hidden border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-zinc-800 text-xs font-bold text-green-400">
            PC
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">PEPECASH / XCP</span>
            <span className="text-sm font-semibold text-zinc-100 font-mono">0.00000420</span>
            <span className="rounded-sm bg-green-500/10 px-1.5 py-0.5 text-xs font-medium text-green-400">
              +5.2%
            </span>
          </div>
        </div>
      </div>

      {/* -- Main Grid: Sidebar + Content ----------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-zinc-800">

        {/* -- Left Sidebar (desktop only) ---------------------------------- */}
        <div className="hidden lg:flex order-1 col-span-1 lg:col-span-3 bg-zinc-950 flex-col">

          {/* Market Info Block */}
          <div className="border-b border-zinc-800 px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-zinc-800 text-xs font-bold text-green-400">
                PC
              </div>
              <div>
                <h1 className="text-sm font-semibold text-zinc-100">PEPECASH / XCP</h1>
                <span className="text-xs text-zinc-500">Counterparty DEX</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-semibold text-zinc-100 font-mono">
                0.00000420 XCP
              </span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-zinc-400">$0.0031 USD</span>
              <span className="rounded-sm bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                +5.2%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">High</span>
                <span className="text-zinc-300 font-mono">0.00000450</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">Low</span>
                <span className="text-zinc-300 font-mono">0.00000390</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">Vol</span>
                <span className="text-zinc-300 font-mono">3.42 XCP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">Spread</span>
                <span className="text-zinc-300 font-mono">0.24%</span>
              </div>
            </div>
          </div>

          {/* Compact Order Book (always visible) */}
          <div className="border-b border-zinc-800">
            <div className="px-3 py-1.5 border-b border-zinc-800">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Order Book</span>
            </div>
            <CompactOrderBook />
          </div>

          {/* Trade Form */}
          <div className="border-b border-zinc-800 p-4">
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

            {/* Stacked form layout */}
            <div className="grid grid-cols-1 gap-2 mb-2">
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
            </div>

            {/* Percentage buttons */}
            <div className="flex gap-1 mb-2">
              {['25%', '50%', '75%', '100%'].map((pct) => (
                <button
                  key={pct}
                  className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
                >
                  {pct}
                </button>
              ))}
            </div>

            {/* Total */}
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Total (XCP)</span>
                <span className="text-zinc-300 font-mono">{totalValue}</span>
              </div>
            </div>

            {/* Fee */}
            <div className="flex items-center justify-between text-xs mb-3">
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

        {/* -- Main Content Area -------------------------------------------- */}
        <div className="order-2 col-span-1 lg:col-span-9 bg-zinc-950 flex flex-col">

          {/* Chart Area */}
          <div className="border-b border-zinc-800">
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
            <div className="relative px-4 py-4 max-sm:px-2" style={{ minHeight: '300px' }}>
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

          {/* -- Desktop Tab Bar (Trades | Holders | My Orders -- NO Order Book) */}
          <div className="hidden lg:block">
            <div className="flex border-b border-zinc-800">
              {(['trades', 'holders', 'markets', 'orders'] as const).map((tab) => {
                const labels = { trades: 'Trades', holders: 'Holders', markets: 'Markets', orders: 'My Orders' }
                return (
                  <button
                    key={tab}
                    onClick={() => setDataTab(tab)}
                    className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      dataTab === tab
                        ? 'text-zinc-100 border-b-2 border-green-500'
                        : 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    {labels[tab]}
                  </button>
                )
              })}
            </div>

            {/* Tab content (fixed height) */}
            <div className="h-[340px] overflow-y-auto">
              {dataTab === 'trades' && <TradesList />}
              {dataTab === 'holders' && <HoldersTable />}
              {dataTab === 'markets' && <MarketsTable />}
              {dataTab === 'orders' && <OrdersEmpty />}
            </div>
          </div>
        </div>

        {/* -- Mobile: Trade Form ------------------------------------------- */}
        <div className="order-3 lg:hidden bg-zinc-950 border-b border-zinc-800 p-4">
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

          {/* Stacked form layout */}
          <div className="grid grid-cols-1 gap-2 mb-2">
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
          </div>

          {/* Percentage buttons */}
          <div className="flex gap-1 mb-2">
            {['25%', '50%', '75%', '100%'].map((pct) => (
              <button
                key={pct}
                className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
              >
                {pct}
              </button>
            ))}
          </div>

          {/* Total */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Total (XCP)</span>
              <span className="text-zinc-300 font-mono">{totalValue}</span>
            </div>
          </div>

          {/* Fee */}
          <div className="flex items-center justify-between text-xs mb-3">
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

        {/* -- Mobile Tab Bar (includes Order Book tab) --------------------- */}
        <div className="order-4 lg:hidden bg-zinc-950 flex border-b border-zinc-800">
          {(['trades', 'holders', 'markets', 'book', 'orders'] as const).map((tab) => {
            const labels = { trades: 'Trades', holders: 'Holders', markets: 'Markets', book: 'Book', orders: 'Orders' }
            return (
              <button
                key={tab}
                onClick={() => setMobileDataTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  mobileDataTab === tab
                    ? 'text-zinc-100 border-b-2 border-green-500'
                    : 'text-zinc-500 border-b-2 border-transparent'
                }`}
              >
                {labels[tab]}
              </button>
            )
          })}
        </div>

        {/* -- Mobile Data Content ------------------------------------------ */}
        <div className="order-5 lg:hidden bg-zinc-950 h-[300px] overflow-y-auto">
          {mobileDataTab === 'trades' && <TradesList />}
          {mobileDataTab === 'holders' && <HoldersTable />}
          {mobileDataTab === 'markets' && <MarketsTable />}
          {mobileDataTab === 'book' && <VerticalOrderBook />}
          {mobileDataTab === 'orders' && <OrdersEmpty />}
        </div>
      </div>
    </div>
  )
}
