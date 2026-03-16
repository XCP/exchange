'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTradingPair } from '@/lib/hooks/useTradingPair'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { MarketHeader } from '@/components/market-header'
import { Chart } from '@/components/chart'
import { CompactBookStrip } from '@/components/compact-book-strip'
import { DataTabs } from '@/components/data-tabs'
import { TradeForm } from '@/components/trade-form'
import { QuickStats } from '@/components/quick-stats'
import { AssetInfo } from '@/components/asset-info'
import { TradesList } from '@/components/trades-list'
import { HoldersTable } from '@/components/holders-table'
import { MarketsTable } from '@/components/markets-table'
import { OrdersEmpty } from '@/components/orders-empty'
import { formatAmount } from '@/utils/format-amount'
import type { OrderBookEntry } from '@/types/trading'

type TabKey = 'trades' | 'holders' | 'markets' | 'orders'
const TAB_LABELS: Record<TabKey, string> = {
  trades: 'Trades',
  holders: 'Holders',
  markets: 'Markets',
  orders: 'Orders',
}

export default function PairOrdersPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: pairSlug } = use(params)

  // Parse pair slug: "PEPECASH_XCP" → base "PEPECASH", quote "XCP", market "PEPECASH/XCP"
  const lastUnderscoreIndex = pairSlug.lastIndexOf('_')
  const baseSymbol = pairSlug.substring(0, lastUnderscoreIndex)
  const quoteSymbol = pairSlug.substring(lastUnderscoreIndex + 1)
  const market = `${baseSymbol}/${quoteSymbol}`

  const { data: pairData, isLoading: pairLoading } = useTradingPair(pairSlug)
  const { bids, asks, spread, spreadPct } = useOrderBook(market)

  // Asset divisibility for quantity normalization
  const baseDivisible = pairData?.asset_info?.divisible
  const [quoteDivisible, setQuoteDivisible] = useState<boolean | undefined>(
    quoteSymbol === 'BTC' || quoteSymbol === 'XCP' ? true : undefined
  )
  useEffect(() => {
    if (quoteSymbol === 'BTC' || quoteSymbol === 'XCP') {
      setQuoteDivisible(true)
      return
    }
    fetch(`https://api.counterparty.io:4000/v2/assets/${quoteSymbol}`)
      .then(r => r.json())
      .then(d => setQuoteDivisible(d?.result?.divisible ?? undefined))
      .catch(() => {})
  }, [quoteSymbol])

  const searchParams = useSearchParams()
  const [mobileDataTab, setMobileDataTab] = useState<TabKey>('trades')

  const lastPrice = pairData?.last_price != null ? formatAmount(pairData.last_price) : undefined

  // Lifted trade form state — seed from query params if present
  const paramSide = searchParams.get('side')
  const paramPrice = searchParams.get('price')
  const paramAmount = searchParams.get('amount')
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>(paramSide === 'sell' ? 'sell' : 'buy')
  const [priceInput, setPriceInput] = useState(paramPrice ?? '')
  const [amountInput, setAmountInput] = useState(paramAmount ?? '')

  // Seed price input once when lastPrice first arrives (skip if query param provided price)
  const seeded = useRef(!!paramPrice)
  useEffect(() => {
    if (lastPrice && !seeded.current) {
      setPriceInput(lastPrice)
      seeded.current = true
    }
  }, [lastPrice])

  // Click an order book row → fill price only (amount left to user intent)
  const handleBookRowClick = (entry: OrderBookEntry, side: 'buy' | 'sell') => {
    setTradeTab(side)
    setPriceInput(entry.price.replace(/,/g, ''))
  }

  const totalSupply = pairData?.asset_info?.supply ?? 0
  const baseAsset = pairData?.base_asset ?? baseSymbol
  const displayBase = pairData?.asset_info?.asset_longname ?? baseSymbol
  const displayMarket = `${displayBase}/${quoteSymbol}`

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Full-width market header (NOT sticky) */}
      <MarketHeader
        pairData={pairData}
        baseSymbol={displayBase}
        quoteSymbol={quoteSymbol}
        market={displayMarket}
        isLoading={pairLoading}
        actionSlot={
          <Link
            href={`/dispense/${baseSymbol}`}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Dispensers →
          </Link>
        }
      />

      {/* Two-column grid — subgrid rows so horizontal lines align */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_auto_1fr] lg:min-h-[calc(100vh-37px)] gap-px bg-zinc-800">

        {/* == LEFT Sidebar (desktop only) — subgrid shares row tracks with main == */}
        <div className="hidden lg:grid lg:order-1 lg:col-span-3 lg:grid-rows-[subgrid] lg:row-span-3">

          {/* Row 1: Trade Form */}
          <div className="bg-zinc-950">
            <TradeForm
              baseSymbol={baseSymbol}
              quoteSymbol={quoteSymbol}
              baseDivisible={baseDivisible}
              quoteDivisible={quoteDivisible}
              tradeTab={tradeTab}
              setTradeTab={setTradeTab}
              priceInput={priceInput}
              setPriceInput={setPriceInput}
              amountInput={amountInput}
              setAmountInput={setAmountInput}
            />
          </div>

          {/* Row 2: Quick Stats */}
          <div className="bg-zinc-950">
            {pairData && <QuickStats pairData={pairData} />}
          </div>

          {/* Row 3: Asset Info */}
          <div className="bg-zinc-950 overflow-y-auto">
            {pairData && <AssetInfo pairData={pairData} />}
          </div>
        </div>

        {/* == MAIN Content Area — subgrid shares row tracks with sidebar == */}
        <div className="order-1 lg:order-2 col-span-1 lg:col-span-9 lg:grid lg:grid-rows-[subgrid] lg:row-span-3 flex flex-col">

          {/* Row 1: Mobile info + Chart */}
          <div className="bg-zinc-950 flex flex-col">
            {/* Mobile condensed market info */}
            <div className="lg:hidden flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-zinc-800 text-[10px] font-bold text-green-400">
                {baseSymbol.slice(0, 2)}
              </div>
              <span className="text-xs font-semibold text-zinc-100">{market}</span>
              <span className="text-sm font-semibold text-zinc-100 font-mono ml-auto">
                {pairData?.last_price != null ? formatAmount(pairData.last_price) : '—'}
              </span>
              {pairData?.price_change_24h != null && (
                <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                  pairData.price_change_24h >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {pairData.price_change_24h >= 0 ? '+' : ''}{pairData.price_change_24h.toFixed(1)}%
                </span>
              )}
            </div>
            <Chart pairSlug={pairSlug} pairLabel={`${baseSymbol}/${quoteSymbol}`} />
          </div>

          {/* Row 2: Order Book strip */}
          <div className="bg-zinc-950">
            <CompactBookStrip bids={bids} asks={asks} spread={spread} spreadPct={spreadPct} onRowClick={handleBookRowClick} />
          </div>

          {/* Row 3: Tabs */}
          <div className="bg-zinc-950 hidden lg:block overflow-y-auto">
            <DataTabs
              market={market}
              baseSymbol={baseSymbol}
              quoteSymbol={quoteSymbol}
              baseAsset={baseAsset}
              totalSupply={totalSupply}
              currentPair={`${baseSymbol}/${quoteSymbol}`}
            />
          </div>
        </div>

        {/* == Mobile-only sections == */}
        <div className="order-3 lg:hidden bg-zinc-950 p-4 border-b border-zinc-800">
          <TradeForm
            baseSymbol={baseSymbol}
            quoteSymbol={quoteSymbol}
            baseDivisible={pairData?.asset_info?.divisible ?? true}
            quoteDivisible={quoteSymbol === 'BTC' || quoteSymbol === 'XCP'}
            tradeTab={tradeTab}
            setTradeTab={setTradeTab}
            priceInput={priceInput}
            setPriceInput={setPriceInput}
            amountInput={amountInput}
            setAmountInput={setAmountInput}
          />
        </div>

        <div className="order-4 lg:hidden bg-zinc-950 flex border-b border-zinc-800">
          {(['trades', 'holders', 'markets', 'orders'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileDataTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                mobileDataTab === tab
                  ? 'text-zinc-100 border-b-2 border-green-500'
                  : 'text-zinc-500 border-b-2 border-transparent'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="order-5 lg:hidden bg-zinc-950 h-[300px] overflow-y-auto">
          {mobileDataTab === 'trades' && <TradesList market={market} baseSymbol={baseSymbol} quoteSymbol={quoteSymbol} />}
          {mobileDataTab === 'holders' && <HoldersTable asset={baseAsset} totalSupply={totalSupply} />}
          {mobileDataTab === 'markets' && <MarketsTable asset={baseAsset} currentPair={`${baseSymbol}/${quoteSymbol}`} />}
          {mobileDataTab === 'orders' && <OrdersEmpty />}
        </div>
      </div>
    </div>
  )
}
