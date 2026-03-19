'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useLatestOrders, type LatestOrder } from '@/lib/hooks/useLatestOrders'
import { useDispensersLatest, useDispensesLatest, type LatestDispenser, type LatestDispense } from '@/lib/hooks/useDispensersLatest'
import { useSatsMode } from '@/lib/sats-context'
import { formatPrice } from '@/utils/format-price'

import { XCP_IMG_BASE } from '@/utils/constants'
import { TogglePills } from './toggle-pills'

function compactTime(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}y`
}

export function RecentActivity() {
  return (
    <>
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Recent Activity</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
        <OrdersCard />
        <DispensersCard />
      </div>
    </>
  )
}

function OrdersCard() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { satsMode } = useSatsMode()
  const { orders: openOrders, isLoading: openLoading } = useLatestOrders('open')
  const { orders: filledOrders, isLoading: filledLoading } = useLatestOrders('filled')

  const orders = tab === 0 ? openOrders.slice(0, 21) : filledOrders.slice(0, 21)
  const isLoading = tab === 0 ? openLoading : filledLoading

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Orders</span>
        <div className="ml-auto">
          <TogglePills
            options={[0, 1] as const}
            value={tab}
            onChange={setTab}
            label={(i) => i === 0 ? 'Open' : 'Filled'}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
              <th className="text-left font-normal px-3 py-1.5 w-10">Side</th>
              <th className="text-right font-normal px-3 py-1.5">Amount</th>
              <th className="text-left font-normal px-3 py-1.5">Asset</th>
              <th className="text-right font-normal px-3 py-1.5">Price</th>
              <th className="text-left font-normal px-3 py-1.5">Quote</th>
            </tr>
          </thead>
          <tbody>
            {isLoading || orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-zinc-500">
                  {isLoading ? 'Loading...' : 'No data'}
                </td>
              </tr>
            ) : orders.map((o) => (
              <OrderRow key={o.tx_hash} order={o} satsMode={satsMode} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OrderRow({ order: o, satsMode }: { order: LatestOrder; satsMode: boolean }) {
  const isBid = /^(buy|bid)$/i.test(o.side)
  const isClosed = o.status !== 'open'
  const displayAmount = isClosed ? o.amount : o.remaining
  const quote = o.quote_asset_longname ?? o.quote_asset

  return (
    <tr className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
      <td className="text-zinc-500 font-mono px-3 py-1.5">
        {o.block_time ? compactTime(o.block_time) : '—'}
      </td>
      <td className={`font-medium px-3 py-1.5 ${isBid ? 'text-green-400' : 'text-red-400'}`}>
        {isBid ? 'Buy' : 'Sell'}
      </td>
      <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
        {displayAmount > 0 ? formatPrice(displayAmount) : '—'}
      </td>
      <td className="px-3 py-1.5">
        <Link href={`/trade/${o.pair}`} className="flex items-center gap-1.5 hover:underline">
          <Image src={`${XCP_IMG_BASE}/icon/${o.base_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
          <span className="text-zinc-200 truncate">{o.base_asset_longname ?? o.base_asset}</span>
        </Link>
      </td>
      <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
        {isFinite(o.price) && o.price > 0 ? formatPrice(o.price, o.quote_asset === 'BTC' && satsMode) : '—'}
      </td>
      <td className="px-3 py-1.5">
        <Link href={`/trade/${o.pair}`} className="flex items-center gap-1.5 hover:underline decoration-zinc-400">
          <Image src={`${XCP_IMG_BASE}/icon/${o.quote_asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
          <span className="text-zinc-400 truncate">{o.quote_asset === 'BTC' && satsMode ? 'sats' : quote}</span>
        </Link>
      </td>
    </tr>
  )
}

function DispensersCard() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { satsMode } = useSatsMode()
  const { dispensers, isLoading: dispLoading } = useDispensersLatest({ status: 'open' }, 21)
  const { dispenses, isLoading: dispenseLoading } = useDispensesLatest({}, 21)

  const isLoading = tab === 0 ? dispLoading : dispenseLoading

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Dispensers</span>
        <div className="ml-auto">
          <TogglePills
            options={[0, 1] as const}
            value={tab}
            onChange={setTab}
            label={(i) => i === 0 ? 'Open' : 'Filled'}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left font-normal px-3 py-1.5 w-8">Time</th>
              <th className="text-right font-normal px-3 py-1.5">Eff. Price</th>
              <th className="text-right font-normal px-3 py-1.5">{tab === 0 ? 'Per Dispense' : 'Qty'}</th>
              <th className="text-left font-normal px-3 py-1.5">Asset</th>
              <th className="text-right font-normal px-3 py-1.5">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {tab === 0 ? (
              isLoading || dispensers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-zinc-500">
                    {isLoading ? 'Loading...' : 'No data'}
                  </td>
                </tr>
              ) : dispensers.map((d) => (
                <DispenserRow key={d.tx_hash} d={d} satsMode={satsMode} />
              ))
            ) : (
              isLoading || dispenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-zinc-500">
                    {isLoading ? 'Loading...' : 'No data'}
                  </td>
                </tr>
              ) : dispenses.map((d, i) => (
                <DispenseRow key={`${d.tx_hash}-${d.dispense_index}`} d={d} satsMode={satsMode} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DispenserRow({ d, satsMode }: { d: LatestDispenser; satsMode: boolean }) {
  const displayName = d.asset_longname ?? d.asset
  const isOpen = d.status < 10
  const remaining = isOpen ? d.give_remaining : d.give_quantity

  return (
    <tr className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
      <td className="text-zinc-500 font-mono px-3 py-1.5">
        {d.block_time ? compactTime(d.block_time) : '—'}
      </td>
      <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
        {formatPrice(d.price, satsMode)}
      </td>
      <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
        {formatPrice(d.give_quantity)}
      </td>
      <td className="px-3 py-1.5">
        <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline">
          <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
          <span className="text-zinc-200 truncate">{displayName}</span>
        </Link>
      </td>
      <td className="text-right text-zinc-500 font-mono px-3 py-1.5">
        {formatPrice(remaining)}
      </td>
    </tr>
  )
}

function DispenseRow({ d, satsMode }: { d: LatestDispense; satsMode: boolean }) {
  const displayName = d.asset_longname ?? d.asset
  const price = (d.price > 0 && isFinite(d.price)) ? d.price : (d.dispense_quantity > 0 && d.btc_amount > 0) ? d.btc_amount / d.dispense_quantity : 0

  return (
    <tr className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
      <td className="text-zinc-500 font-mono px-3 py-1.5">
        {d.block_time ? compactTime(d.block_time) : '—'}
      </td>
      <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
        {price > 0 ? formatPrice(price, satsMode) : '—'}
      </td>
      <td className="text-right text-zinc-400 font-mono px-3 py-1.5">
        {formatPrice(d.dispense_quantity)}
      </td>
      <td className="px-3 py-1.5">
        <Link href={`/dispense/${encodeURIComponent(d.asset)}`} className="flex items-center gap-1.5 hover:underline">
          <Image src={`${XCP_IMG_BASE}/icon/${d.asset}`} alt="" width={14} height={14} className="rounded-sm" unoptimized />
          <span className="text-zinc-200 truncate">{displayName}</span>
        </Link>
      </td>
      <td className="text-right text-zinc-500 font-mono px-3 py-1.5">—</td>
    </tr>
  )
}
