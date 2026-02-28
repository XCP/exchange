'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useGlobalOrders } from '@/lib/hooks/useGlobalOrders'
import { useGlobalTrades } from '@/lib/hooks/useGlobalTrades'
import { useGlobalDispensers, useGlobalDispenses } from '@/lib/hooks/useGlobalDispensers'
import { formatPrice } from '@/utils/format-price'
import { assetsToTradingPairFromSymbols, getTradingPairSlugFromSymbols } from '@/utils/trading-pair'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { Order, GlobalOrderMatch, Dispenser, Dispense } from '@/types/trading'

function compactTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

/** Derive price (quote/base) and base remaining from a raw order */
function orderPriceAndAmount(order: Order) {
  const giveSymbol = order.give_asset_info?.asset_longname ?? order.give_asset
  const getSymbol = order.get_asset_info?.asset_longname ?? order.get_asset
  const [base] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
  const isSellingBase = giveSymbol === base
  const price = isSellingBase
    ? parseFloat(order.get_remaining_normalized) / parseFloat(order.give_remaining_normalized)
    : parseFloat(order.give_remaining_normalized) / parseFloat(order.get_remaining_normalized)
  const baseAmount = isSellingBase ? order.give_remaining_normalized : order.get_remaining_normalized
  return { price, baseAmount }
}

/** Derive price (quote/base) and base amount from a raw trade */
function tradePriceAndAmount(trade: GlobalOrderMatch) {
  const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
  const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
  const [base] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
  const isForwardBase = fwdSymbol === base
  const price = isForwardBase
    ? parseFloat(trade.backward_quantity_normalized) / parseFloat(trade.forward_quantity_normalized)
    : parseFloat(trade.forward_quantity_normalized) / parseFloat(trade.backward_quantity_normalized)
  const baseAmount = isForwardBase ? trade.forward_quantity_normalized : trade.backward_quantity_normalized
  return { price, baseAmount }
}

export default function LatestPage() {
  const { orders, isLoading: ordersLoading } = useGlobalOrders(50)
  const { trades, isLoading: tradesLoading } = useGlobalTrades(50)
  const { dispensers, isLoading: dispensersLoading } = useGlobalDispensers(50)
  const { dispenses, isLoading: dispensesLoading } = useGlobalDispenses(50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Latest Activity</h1>
          <p className="text-xs text-zinc-500">Recent on-chain activity across the Counterparty DEX</p>
        </div>

        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">DEX Orders</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          <OrdersPanel orders={orders} isLoading={ordersLoading} />
          <TradesPanel trades={trades} isLoading={tradesLoading} />
        </div>

        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Dispensers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <DispensersPanel dispensers={dispensers} isLoading={dispensersLoading} />
          <DispensesPanel dispenses={dispenses} isLoading={dispensesLoading} />
        </div>
      </div>
    </div>
  )
}

function EmptyRows({ loading, label, cols }: { loading: boolean; label: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-10 text-zinc-600 text-xs">
        {loading ? `Loading ${label}...` : `No recent ${label}`}
      </td>
    </tr>
  )
}

function OrdersPanel({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">New Orders</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
            <th className="text-left font-normal px-2 py-1.5">Pair</th>
            <th className="text-right font-normal px-2 py-1.5">Price</th>
            <th className="text-right font-normal px-2 py-1.5">Amount</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || orders.length === 0 ? (
            <EmptyRows loading={isLoading} label="orders" cols={4} />
          ) : (
            orders.map((order) => {
              const giveSymbol = order.give_asset_info?.asset_longname ?? order.give_asset
              const getSymbol = order.get_asset_info?.asset_longname ?? order.get_asset
              const [base, quote] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
              const pairSlug = getTradingPairSlugFromSymbols(giveSymbol, getSymbol)
              const { price, baseAmount } = orderPriceAndAmount(order)
              const baseAsset = giveSymbol === base ? order.give_asset : order.get_asset

              return (
                <tr key={order.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="text-zinc-600 font-mono px-2 py-px">
                    {order.block_time ? compactTime(order.block_time) : '—'}
                  </td>
                  <td className="px-2 py-px">
                    <Link href={`/trade/${pairSlug}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${baseAsset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{base}/{quote}</span>
                    </Link>
                  </td>
                  <td className="text-right text-zinc-300 font-mono px-2 py-px">
                    {isFinite(price) ? formatPrice(price) : '—'}
                  </td>
                  <td className="text-right text-zinc-400 font-mono px-2 py-px">
                    {formatPrice(baseAmount)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function TradesPanel({ trades, isLoading }: { trades: GlobalOrderMatch[]; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">Recent Matches</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
            <th className="text-left font-normal px-2 py-1.5">Pair</th>
            <th className="text-right font-normal px-2 py-1.5">Price</th>
            <th className="text-right font-normal px-2 py-1.5">Amount</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || trades.length === 0 ? (
            <EmptyRows loading={isLoading} label="trades" cols={4} />
          ) : (
            trades.map((trade) => {
              const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
              const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
              const [base, quote] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
              const pairSlug = getTradingPairSlugFromSymbols(fwdSymbol, bwdSymbol)
              const { price, baseAmount } = tradePriceAndAmount(trade)
              const baseAsset = fwdSymbol === base ? trade.forward_asset : trade.backward_asset

              return (
                <tr key={trade.id} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="text-zinc-600 font-mono px-2 py-px">
                    {trade.block_time ? compactTime(trade.block_time) : '—'}
                  </td>
                  <td className="px-2 py-px">
                    <Link href={`/trade/${pairSlug}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${baseAsset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{base}/{quote}</span>
                    </Link>
                  </td>
                  <td className="text-right text-zinc-300 font-mono px-2 py-px">
                    {isFinite(price) ? formatPrice(price) : '—'}
                  </td>
                  <td className="text-right text-zinc-400 font-mono px-2 py-px">
                    {formatPrice(baseAmount)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function DispensersPanel({ dispensers, isLoading }: { dispensers: Dispenser[]; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">New Dispensers</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
            <th className="text-left font-normal px-2 py-1.5">Asset</th>
            <th className="text-right font-normal px-2 py-1.5">Price</th>
            <th className="text-right font-normal px-2 py-1.5">Available</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || dispensers.length === 0 ? (
            <EmptyRows loading={isLoading} label="dispensers" cols={4} />
          ) : (
            dispensers.map((dispenser) => {
              const assetSymbol = dispenser.asset_info?.asset_longname ?? dispenser.asset

              return (
                <tr key={dispenser.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="text-zinc-600 font-mono px-2 py-px">
                    {dispenser.block_time ? compactTime(dispenser.block_time) : '—'}
                  </td>
                  <td className="px-2 py-px">
                    <Link href={`/dispense/${encodeURIComponent(assetSymbol)}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${dispenser.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{assetSymbol}</span>
                    </Link>
                  </td>
                  <td className="text-right text-zinc-300 font-mono px-2 py-px">
                    {formatPrice(dispenser.satoshirate_normalized)}
                  </td>
                  <td className="text-right text-zinc-400 font-mono px-2 py-px">
                    {formatPrice(dispenser.give_remaining_normalized)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function DispensesPanel({ dispenses, isLoading }: { dispenses: Dispense[]; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">Recent Dispenses</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
            <th className="text-left font-normal px-2 py-1.5">Asset</th>
            <th className="text-right font-normal px-2 py-1.5">Price</th>
            <th className="text-right font-normal px-2 py-1.5">Qty</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || dispenses.length === 0 ? (
            <EmptyRows loading={isLoading} label="dispenses" cols={4} />
          ) : (
            dispenses.map((dispense) => {
              const assetSymbol = dispense.asset_info?.asset_longname ?? dispense.asset
              const qty = parseFloat(dispense.dispense_quantity_normalized)
              const price = qty > 0 ? parseFloat(dispense.btc_amount_normalized) / qty : 0

              return (
                <tr key={`${dispense.tx_hash}-${dispense.dispense_index}`} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="text-zinc-600 font-mono px-2 py-px">
                    {dispense.block_time ? compactTime(dispense.block_time) : '—'}
                  </td>
                  <td className="px-2 py-px">
                    <Link href={`/dispense/${encodeURIComponent(assetSymbol)}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${dispense.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{assetSymbol}</span>
                    </Link>
                  </td>
                  <td className="text-right text-zinc-300 font-mono px-2 py-px">
                    {isFinite(price) && price > 0 ? formatPrice(price) : '—'}
                  </td>
                  <td className="text-right text-zinc-400 font-mono px-2 py-px">
                    {formatPrice(dispense.dispense_quantity_normalized)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
