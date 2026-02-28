'use client'

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

        {/* DEX Orders + Trades */}
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">DEX Orders</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          <OrdersPanel orders={orders} isLoading={ordersLoading} />
          <TradesPanel trades={trades} isLoading={tradesLoading} />
        </div>

        {/* Dispensers + Dispenses */}
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Dispensers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <DispensersPanel dispensers={dispensers} isLoading={dispensersLoading} />
          <DispensesPanel dispenses={dispenses} isLoading={dispensesLoading} />
        </div>
      </div>
    </div>
  )
}

function EmptyRows({ loading, label }: { loading: boolean; label: string }) {
  return (
    <tr>
      <td colSpan={4} className="text-center py-10 text-zinc-600 text-xs">
        {loading ? `Loading ${label}...` : `No recent ${label}`}
      </td>
    </tr>
  )
}

function OrdersPanel({ orders, isLoading }: { orders: ReturnType<typeof useGlobalOrders>['orders']; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">New Orders</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">Pair</th>
            <th className="text-right font-normal px-3 py-1.5">Give</th>
            <th className="text-right font-normal px-3 py-1.5">Get</th>
            <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Time</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || orders.length === 0 ? (
            <EmptyRows loading={isLoading} label="orders" />
          ) : (
            orders.map((order) => {
              const giveSymbol = order.give_asset_info?.asset_longname ?? order.give_asset
              const getSymbol = order.get_asset_info?.asset_longname ?? order.get_asset
              const [base, quote] = assetsToTradingPairFromSymbols(giveSymbol, getSymbol)
              const pairSlug = getTradingPairSlugFromSymbols(giveSymbol, getSymbol)

              return (
                <tr key={order.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/trade/${pairSlug}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${order.give_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{base}/{quote}</span>
                    </Link>
                  </td>
                  <td className="text-right text-red-400 font-mono px-3 py-1.5">
                    {formatPrice(order.give_remaining_normalized)}
                  </td>
                  <td className="text-right text-green-400 font-mono px-3 py-1.5">
                    {formatPrice(order.get_remaining_normalized)}
                  </td>
                  <td className="text-right text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                    {order.block_time ? formatTimeAgo(order.block_time) : '—'}
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

function TradesPanel({ trades, isLoading }: { trades: ReturnType<typeof useGlobalTrades>['trades']; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">Recent Matches</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">Pair</th>
            <th className="text-right font-normal px-3 py-1.5">Gave</th>
            <th className="text-right font-normal px-3 py-1.5">Got</th>
            <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Time</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || trades.length === 0 ? (
            <EmptyRows loading={isLoading} label="trades" />
          ) : (
            trades.map((trade) => {
              const fwdSymbol = trade.forward_asset_info?.asset_longname ?? trade.forward_asset
              const bwdSymbol = trade.backward_asset_info?.asset_longname ?? trade.backward_asset
              const [base, quote] = assetsToTradingPairFromSymbols(fwdSymbol, bwdSymbol)
              const pairSlug = getTradingPairSlugFromSymbols(fwdSymbol, bwdSymbol)

              return (
                <tr key={trade.id} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/trade/${pairSlug}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${trade.forward_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{base}/{quote}</span>
                    </Link>
                  </td>
                  <td className="text-right text-red-400 font-mono px-3 py-1.5">
                    {formatPrice(trade.forward_quantity_normalized)}
                  </td>
                  <td className="text-right text-green-400 font-mono px-3 py-1.5">
                    {formatPrice(trade.backward_quantity_normalized)}
                  </td>
                  <td className="text-right text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                    {trade.block_time ? formatTimeAgo(trade.block_time) : '—'}
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

function DispensersPanel({ dispensers, isLoading }: { dispensers: ReturnType<typeof useGlobalDispensers>['dispensers']; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">New Dispensers</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">Asset</th>
            <th className="text-right font-normal px-3 py-1.5">Price</th>
            <th className="text-right font-normal px-3 py-1.5">Available</th>
            <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Time</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || dispensers.length === 0 ? (
            <EmptyRows loading={isLoading} label="dispensers" />
          ) : (
            dispensers.map((dispenser) => {
              const assetSymbol = dispenser.asset_info?.asset_longname ?? dispenser.asset

              return (
                <tr key={dispenser.tx_hash} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/dispense/${encodeURIComponent(assetSymbol)}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${dispenser.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{assetSymbol}</span>
                    </Link>
                  </td>
                  <td className="text-right text-orange-400 font-mono px-3 py-1.5">
                    {formatPrice(dispenser.satoshirate_normalized)}
                  </td>
                  <td className="text-right text-green-400 font-mono px-3 py-1.5">
                    {formatPrice(dispenser.give_remaining_normalized)}
                  </td>
                  <td className="text-right text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                    {dispenser.block_time ? formatTimeAgo(dispenser.block_time) : '—'}
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

function DispensesPanel({ dispenses, isLoading }: { dispenses: ReturnType<typeof useGlobalDispenses>['dispenses']; isLoading: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">Recent Dispenses</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">Asset</th>
            <th className="text-right font-normal px-3 py-1.5">Qty</th>
            <th className="text-right font-normal px-3 py-1.5">BTC</th>
            <th className="text-right font-normal px-3 py-1.5 max-sm:hidden">Time</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || dispenses.length === 0 ? (
            <EmptyRows loading={isLoading} label="dispenses" />
          ) : (
            dispenses.map((dispense) => {
              const assetSymbol = dispense.asset_info?.asset_longname ?? dispense.asset

              return (
                <tr key={`${dispense.tx_hash}-${dispense.dispense_index}`} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/dispense/${encodeURIComponent(assetSymbol)}`} className="flex items-center gap-1.5 hover:underline">
                      <Image src={`${XCP_IMG_BASE}/icon/${dispense.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
                      <span className="text-zinc-200 truncate">{assetSymbol}</span>
                    </Link>
                  </td>
                  <td className="text-right text-green-400 font-mono px-3 py-1.5">
                    {formatPrice(dispense.dispense_quantity_normalized)}
                  </td>
                  <td className="text-right text-orange-400 font-mono px-3 py-1.5">
                    {formatPrice(dispense.btc_amount_normalized)}
                  </td>
                  <td className="text-right text-zinc-600 font-mono px-3 py-1.5 max-sm:hidden">
                    {dispense.block_time ? formatTimeAgo(dispense.block_time) : '—'}
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
