'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGlobalOrders } from '@/lib/hooks/useGlobalOrders'
import { useGlobalTrades } from '@/lib/hooks/useGlobalTrades'
import { useGlobalDispensers, useGlobalDispenses } from '@/lib/hooks/useGlobalDispensers'
import { formatAddress } from '@/utils/format-address'
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

function orderPriceAndSide(order: Order) {
  const giveSymbol = order.give_asset_info?.asset_longname ?? order.give_asset
  const getSymbol = order.get_asset_info?.asset_longname ?? order.get_asset
  const [base] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
  const isSellingBase = giveSymbol === base
  const price = isSellingBase
    ? parseFloat(order.get_remaining_normalized) / parseFloat(order.give_remaining_normalized)
    : parseFloat(order.give_remaining_normalized) / parseFloat(order.get_remaining_normalized)
  const baseAmount = isSellingBase ? order.give_remaining_normalized : order.get_remaining_normalized
  const side = isSellingBase ? 'Sell' : 'Buy'
  return { price, baseAmount, side }
}

function tradePriceAndSide(trade: GlobalOrderMatch) {
  const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
  const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
  const [base] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
  const isForwardBase = fwdSymbol === base
  const price = isForwardBase
    ? parseFloat(trade.backward_quantity_normalized) / parseFloat(trade.forward_quantity_normalized)
    : parseFloat(trade.forward_quantity_normalized) / parseFloat(trade.backward_quantity_normalized)
  const baseAmount = isForwardBase ? trade.forward_quantity_normalized : trade.backward_quantity_normalized
  const side = isForwardBase ? 'Buy' : 'Sell'
  return { price, baseAmount, side }
}

type Section = 'orders' | 'dispensers'

export default function LatestPage() {
  const [section, setSection] = useState<Section>('orders')
  const { orders, isLoading: ordersLoading } = useGlobalOrders(50)
  const { trades, isLoading: tradesLoading } = useGlobalTrades(50)
  const { dispensers, isLoading: dispensersLoading } = useGlobalDispensers(50)
  const { dispenses, isLoading: dispensesLoading } = useGlobalDispenses(50)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">Latest Activity</h1>
            <p className="text-xs text-zinc-500">Recent on-chain activity across the Counterparty DEX</p>
          </div>
          <div className="flex gap-0.5 ml-auto self-start mt-1">
            {(['orders', 'dispensers'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`px-2.5 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                  section === s
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {s === 'orders' ? 'Orders' : 'Dispensers'}
              </button>
            ))}
          </div>
        </div>

        {section === 'orders' ? (
          <OrdersSection orders={orders} trades={trades} ordersLoading={ordersLoading} tradesLoading={tradesLoading} />
        ) : (
          <DispensersSection dispensers={dispensers} dispenses={dispenses} dispensersLoading={dispensersLoading} dispensesLoading={dispensesLoading} />
        )}
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

// ── Orders Section ──────────────────────────────────────────────────

function OrdersSection({ orders, trades, ordersLoading, tradesLoading }: {
  orders: Order[]
  trades: GlobalOrderMatch[]
  ordersLoading: boolean
  tradesLoading: boolean
}) {
  const [tab, setTab] = useState<0 | 1>(0)

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">DEX Orders</span>
        <div className="flex gap-0.5 ml-auto">
          {['New', 'Matched'].map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i as 0 | 1)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                tab === i
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 0 ? (
        <OrdersTable orders={orders} isLoading={ordersLoading} />
      ) : (
        <TradesTable trades={trades} isLoading={tradesLoading} />
      )}
    </div>
  )
}

function OrdersTable({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-2 py-1.5 w-10">Side</th>
          <th className="text-left font-normal px-2 py-1.5">Asset</th>
          <th className="text-right font-normal px-2 py-1.5">Price</th>
          <th className="text-left font-normal px-2 py-1.5">Quote</th>
          <th className="text-right font-normal px-2 py-1.5">Amount</th>
          <th className="text-left font-normal px-2 py-1.5"></th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Address</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Status</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || orders.length === 0 ? (
          <EmptyRows loading={isLoading} label="orders" cols={9} />
        ) : (
          orders.map((order) => {
            const giveSymbol = order.give_asset_info?.asset_longname ?? order.give_asset
            const getSymbol = order.get_asset_info?.asset_longname ?? order.get_asset
            const [base, quote] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
            const pairSlug = getTradingPairSlugFromSymbols(giveSymbol, getSymbol)
            const { price, baseAmount, side } = orderPriceAndSide(order)
            const baseAsset = giveSymbol === base ? order.give_asset : order.get_asset

            return (
              <tr key={order.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-600 font-mono px-2 py-px">
                  {order.block_time ? compactTime(order.block_time) : '—'}
                </td>
                <td className={`font-medium px-2 py-px ${side === 'Buy' ? 'text-green-400' : 'text-red-400'}`}>
                  {side}
                </td>
                <td className="px-2 py-px">
                  <Link href={`/trade/${pairSlug}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${baseAsset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{base}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-300 font-mono px-2 py-px">
                  {isFinite(price) ? formatPrice(price) : '—'}
                </td>
                <td className="text-left text-zinc-500 px-2 py-px">
                  {quote}
                </td>
                <td className="text-right text-zinc-400 font-mono px-2 py-px">
                  {formatPrice(baseAmount)}
                </td>
                <td className="text-left text-zinc-500 px-2 py-px">
                  {base}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(order.source)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden capitalize">
                  {order.status.replace(/_/g, ' ')}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

function TradesTable({ trades, isLoading }: { trades: GlobalOrderMatch[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-2 py-1.5 w-10">Side</th>
          <th className="text-left font-normal px-2 py-1.5">Asset</th>
          <th className="text-right font-normal px-2 py-1.5">Price</th>
          <th className="text-left font-normal px-2 py-1.5">Quote</th>
          <th className="text-right font-normal px-2 py-1.5">Amount</th>
          <th className="text-left font-normal px-2 py-1.5"></th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Maker</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Taker</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || trades.length === 0 ? (
          <EmptyRows loading={isLoading} label="trades" cols={9} />
        ) : (
          trades.map((trade) => {
            const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
            const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
            const [base, quote] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
            const pairSlug = getTradingPairSlugFromSymbols(fwdSymbol, bwdSymbol)
            const { price, baseAmount, side } = tradePriceAndSide(trade)
            const baseAsset = fwdSymbol === base ? trade.forward_asset : trade.backward_asset

            return (
              <tr key={trade.id} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                <td className="text-zinc-600 font-mono px-2 py-px">
                  {trade.block_time ? compactTime(trade.block_time) : '—'}
                </td>
                <td className={`font-medium px-2 py-px ${side === 'Buy' ? 'text-green-400' : 'text-red-400'}`}>
                  {side}
                </td>
                <td className="px-2 py-px">
                  <Link href={`/trade/${pairSlug}`} className="flex items-center gap-1.5 hover:underline">
                    <Image src={`${XCP_IMG_BASE}/icon/${baseAsset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                    <span className="text-zinc-200 truncate">{base}</span>
                  </Link>
                </td>
                <td className="text-right text-zinc-300 font-mono px-2 py-px">
                  {isFinite(price) ? formatPrice(price) : '—'}
                </td>
                <td className="text-left text-zinc-500 px-2 py-px">
                  {quote}
                </td>
                <td className="text-right text-zinc-400 font-mono px-2 py-px">
                  {formatPrice(baseAmount)}
                </td>
                <td className="text-left text-zinc-500 px-2 py-px">
                  {base}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(trade.tx0_address)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(trade.tx1_address)}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

// ── Dispensers Section ───────────────────────────────────────────────

function DispensersSection({ dispensers, dispenses, dispensersLoading, dispensesLoading }: {
  dispensers: Dispenser[]
  dispenses: Dispense[]
  dispensersLoading: boolean
  dispensesLoading: boolean
}) {
  const [tab, setTab] = useState<0 | 1>(0)

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Dispensers</span>
        <div className="flex gap-0.5 ml-auto">
          {['New', 'Dispenses'].map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i as 0 | 1)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                tab === i
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 0 ? (
        <DispensersTable dispensers={dispensers} isLoading={dispensersLoading} />
      ) : (
        <DispensesTable dispenses={dispenses} isLoading={dispensesLoading} />
      )}
    </div>
  )
}

function DispensersTable({ dispensers, isLoading }: { dispensers: Dispenser[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-2 py-1.5">Asset</th>
          <th className="text-right font-normal px-2 py-1.5">Price</th>
          <th className="text-right font-normal px-2 py-1.5">Available</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Address</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Dispenses</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || dispensers.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispensers" cols={6} />
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
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(dispenser.source)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {dispenser.dispense_count}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

function DispensesTable({ dispenses, isLoading }: { dispenses: Dispense[]; isLoading: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 border-b border-zinc-800">
          <th className="text-left font-normal px-2 py-1.5 w-8">Time</th>
          <th className="text-left font-normal px-2 py-1.5">Asset</th>
          <th className="text-right font-normal px-2 py-1.5">Price</th>
          <th className="text-right font-normal px-2 py-1.5">Qty</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Buyer</th>
          <th className="text-right font-normal px-2 py-1.5 max-sm:hidden">Seller</th>
        </tr>
      </thead>
      <tbody>
        {isLoading || dispenses.length === 0 ? (
          <EmptyRows loading={isLoading} label="dispenses" cols={6} />
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
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(dispense.destination)}
                </td>
                <td className="text-right text-zinc-500 font-mono px-2 py-px max-sm:hidden">
                  {formatAddress(dispense.source)}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
