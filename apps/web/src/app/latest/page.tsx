'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGlobalOrders } from '@/lib/hooks/useGlobalOrders'
import { useGlobalTrades } from '@/lib/hooks/useGlobalTrades'
import { useGlobalDispensers, useGlobalDispenses } from '@/lib/hooks/useGlobalDispensers'
import { formatAddress } from '@/utils/format-address'
import { formatPrice } from '@/utils/format-price'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { assetsToTradingPairFromSymbols, getTradingPairSlugFromSymbols } from '@/utils/trading-pair'
import { XCP_IMG_BASE } from '@/utils/constants'

type Tab = 'orders' | 'trades' | 'dispensers' | 'dispenses'

const TABS: { key: Tab; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'trades', label: 'Trades' },
  { key: 'dispensers', label: 'Dispensers' },
  { key: 'dispenses', label: 'Dispenses' },
]

export default function NewPage() {
  const [tab, setTab] = useState<Tab>('orders')
  const { orders, isLoading: ordersLoading } = useGlobalOrders(50)
  const { trades, isLoading: tradesLoading } = useGlobalTrades(50)
  const { dispensers, isLoading: dispensersLoading } = useGlobalDispensers(50)
  const { dispenses, isLoading: dispensesLoading } = useGlobalDispenses(50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Recent Activity</h1>
          <p className="text-xs text-zinc-500">Latest on-chain activity across the Counterparty DEX</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs font-mono px-3 py-1.5 rounded-sm transition-colors ${
                tab === t.key
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="border border-zinc-800 rounded-sm overflow-hidden">
          {tab === 'orders' && <OrdersTable orders={orders} isLoading={ordersLoading} />}
          {tab === 'trades' && <TradesTable trades={trades} isLoading={tradesLoading} />}
          {tab === 'dispensers' && <DispensersTable dispensers={dispensers} isLoading={dispensersLoading} />}
          {tab === 'dispenses' && <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ loading, label }: { loading: boolean; label: string }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-zinc-500">Loading {label}...</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center py-20">
      <span className="text-sm text-zinc-600">No recent {label} found</span>
    </div>
  )
}

function OrdersTable({ orders, isLoading }: { orders: ReturnType<typeof useGlobalOrders>['orders']; isLoading: boolean }) {
  if (isLoading || orders.length === 0) {
    return <EmptyState loading={isLoading} label="orders" />
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
        <span>Pair</span>
        <span className="text-right">Give</span>
        <span className="text-right">Get</span>
        <span className="text-right max-sm:hidden">Address</span>
        <span className="text-right max-sm:hidden">Status</span>
        <span className="text-right max-sm:hidden">Time</span>
      </div>
      <div>
        {orders.map((order) => {
          const giveSymbol = order.give_asset_info?.asset_longname ?? order.give_asset
          const getSymbol = order.get_asset_info?.asset_longname ?? order.get_asset
          const [base, quote] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
          const pairSlug = getTradingPairSlugFromSymbols(giveSymbol, getSymbol)
          const pairLabel = `${base}/${quote}`

          return (
            <Link
              key={order.tx_hash}
              href={`/trade/${pairSlug}`}
              className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
            >
              <span className="flex items-center gap-2">
                <Image
                  src={`${XCP_IMG_BASE}/icon/${order.give_asset}`}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-sm"
                  unoptimized
                />
                <span className="text-zinc-200 font-medium truncate">{pairLabel}</span>
              </span>
              <span className="text-right text-red-400 font-mono">
                {formatPrice(order.give_remaining_normalized)} <span className="text-zinc-600">{giveSymbol.length > 10 ? giveSymbol.slice(0, 8) + '…' : giveSymbol}</span>
              </span>
              <span className="text-right text-green-400 font-mono">
                {formatPrice(order.get_remaining_normalized)} <span className="text-zinc-600">{getSymbol.length > 10 ? getSymbol.slice(0, 8) + '…' : getSymbol}</span>
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {formatAddress(order.source)}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden capitalize">
                {order.status.replace(/_/g, ' ')}
              </span>
              <span className="text-right text-zinc-600 font-mono max-sm:hidden">
                {order.block_time ? formatTimeAgo(order.block_time) : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function TradesTable({ trades, isLoading }: { trades: ReturnType<typeof useGlobalTrades>['trades']; isLoading: boolean }) {
  if (isLoading || trades.length === 0) {
    return <EmptyState loading={isLoading} label="trades" />
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
        <span>Pair</span>
        <span className="text-right">Gave</span>
        <span className="text-right">Got</span>
        <span className="text-right max-sm:hidden">Maker</span>
        <span className="text-right max-sm:hidden">Taker</span>
        <span className="text-right max-sm:hidden">Time</span>
      </div>
      <div>
        {trades.map((trade) => {
          const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
          const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
          const [base, quote] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
          const pairSlug = getTradingPairSlugFromSymbols(fwdSymbol, bwdSymbol)
          const pairLabel = `${base}/${quote}`

          return (
            <Link
              key={trade.id}
              href={`/trade/${pairSlug}`}
              className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
            >
              <span className="flex items-center gap-2">
                <Image
                  src={`${XCP_IMG_BASE}/icon/${trade.forward_asset}`}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-sm"
                  unoptimized
                />
                <span className="text-zinc-200 font-medium truncate">{pairLabel}</span>
              </span>
              <span className="text-right text-red-400 font-mono">
                {formatPrice(trade.forward_quantity_normalized)} <span className="text-zinc-600">{fwdSymbol.length > 10 ? fwdSymbol.slice(0, 8) + '…' : fwdSymbol}</span>
              </span>
              <span className="text-right text-green-400 font-mono">
                {formatPrice(trade.backward_quantity_normalized)} <span className="text-zinc-600">{bwdSymbol.length > 10 ? bwdSymbol.slice(0, 8) + '…' : bwdSymbol}</span>
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {formatAddress(trade.tx0_address)}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {formatAddress(trade.tx1_address)}
              </span>
              <span className="text-right text-zinc-600 font-mono max-sm:hidden">
                {trade.block_time ? formatTimeAgo(trade.block_time) : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function DispensersTable({ dispensers, isLoading }: { dispensers: ReturnType<typeof useGlobalDispensers>['dispensers']; isLoading: boolean }) {
  if (isLoading || dispensers.length === 0) {
    return <EmptyState loading={isLoading} label="dispensers" />
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
        <span>Asset</span>
        <span className="text-right">Price (BTC)</span>
        <span className="text-right">Available</span>
        <span className="text-right max-sm:hidden">Address</span>
        <span className="text-right max-sm:hidden">Dispenses</span>
        <span className="text-right max-sm:hidden">Time</span>
      </div>
      <div>
        {dispensers.map((dispenser) => {
          const assetSymbol = dispenser.asset_info?.asset_longname ?? dispenser.asset

          return (
            <Link
              key={dispenser.tx_hash}
              href={`/dispense/${encodeURIComponent(assetSymbol)}`}
              className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
            >
              <span className="flex items-center gap-2">
                <Image
                  src={`${XCP_IMG_BASE}/icon/${dispenser.asset}`}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-sm"
                  unoptimized
                />
                <span className="text-zinc-200 font-medium truncate">{assetSymbol}</span>
              </span>
              <span className="text-right text-orange-400 font-mono">
                {formatPrice(dispenser.satoshirate_normalized)}
              </span>
              <span className="text-right text-green-400 font-mono">
                {formatPrice(dispenser.give_remaining_normalized)}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {formatAddress(dispenser.source)}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {dispenser.dispense_count}
              </span>
              <span className="text-right text-zinc-600 font-mono max-sm:hidden">
                {dispenser.block_time ? formatTimeAgo(dispenser.block_time) : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function DispensesTable({ dispenses, isLoading }: { dispenses: ReturnType<typeof useGlobalDispenses>['dispenses']; isLoading: boolean }) {
  if (isLoading || dispenses.length === 0) {
    return <EmptyState loading={isLoading} label="dispenses" />
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-0 px-4 py-2.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 max-sm:grid-cols-3">
        <span>Asset</span>
        <span className="text-right">Qty</span>
        <span className="text-right">BTC</span>
        <span className="text-right max-sm:hidden">Buyer</span>
        <span className="text-right max-sm:hidden">Seller</span>
        <span className="text-right max-sm:hidden">Time</span>
      </div>
      <div>
        {dispenses.map((dispense) => {
          const assetSymbol = dispense.asset_info?.asset_longname ?? dispense.asset

          return (
            <Link
              key={`${dispense.tx_hash}-${dispense.dispense_index}`}
              href={`/dispense/${encodeURIComponent(assetSymbol)}`}
              className="grid grid-cols-6 gap-0 px-4 py-2 text-xs hover:bg-zinc-900 transition-colors cursor-pointer border-b border-zinc-800/50 last:border-0 max-sm:grid-cols-3"
            >
              <span className="flex items-center gap-2">
                <Image
                  src={`${XCP_IMG_BASE}/icon/${dispense.asset}`}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-sm"
                  unoptimized
                />
                <span className="text-zinc-200 font-medium truncate">{assetSymbol}</span>
              </span>
              <span className="text-right text-green-400 font-mono">
                {formatPrice(dispense.dispense_quantity_normalized)}
              </span>
              <span className="text-right text-orange-400 font-mono">
                {formatPrice(dispense.btc_amount_normalized)}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {formatAddress(dispense.destination)}
              </span>
              <span className="text-right text-zinc-500 font-mono max-sm:hidden">
                {formatAddress(dispense.source)}
              </span>
              <span className="text-right text-zinc-600 font-mono max-sm:hidden">
                {dispense.block_time ? formatTimeAgo(dispense.block_time) : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
