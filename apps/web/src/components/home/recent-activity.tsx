'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
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

function CollectionChip({ slug, name, type }: { slug: string; name: string; type: 'trade' | 'dispense' }) {
  const router = useRouter()
  return (
    <span
      role="link"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        router.push(`/${type}?v=${slug}`)
      }}
      className="text-[10px] italic text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer truncate"
    >
      {name}
    </span>
  )
}

const CARD_COUNT = 4

export function RecentActivity({ mobileMode }: { mobileMode?: 'xcp' | 'btc' }) {
  return (
    <>
      <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Recent Activity</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
        <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
          <OrdersCard />
        </div>
        <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
          <DispensersCard />
        </div>
      </div>
    </>
  )
}

function OrdersCard() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { satsMode } = useSatsMode()
  const { orders: openOrders, isLoading: openLoading } = useLatestOrders('open')
  const { orders: filledOrders, isLoading: filledLoading } = useLatestOrders('filled')

  const orders = tab === 0 ? openOrders.slice(0, CARD_COUNT) : filledOrders.slice(0, CARD_COUNT)
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
      <div>
        {isLoading || orders.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">
            {isLoading ? 'Loading...' : 'No data'}
          </div>
        ) : orders.map((o, i) => (
          <OrderRow key={o.tx_hash} order={o} satsMode={satsMode} last={i === orders.length - 1} />
        ))}
      </div>
    </div>
  )
}

function OrderRow({ order: o, satsMode, last }: { order: LatestOrder; satsMode: boolean; last: boolean }) {
  const isBid = /^(buy|bid)$/i.test(o.side)
  const isClosed = o.status !== 'open'
  const displayAmount = isClosed ? o.amount : o.remaining
  const name = o.base_asset_longname ?? o.base_asset
  const quote = o.quote_asset === 'BTC' && satsMode ? 'sats' : (o.quote_asset_longname ?? o.quote_asset)

  return (
    <Link
      href={`/trade/${o.pair}`}
      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors ${last ? '' : 'border-b border-zinc-800/30'}`}
    >
      <div className="relative shrink-0 w-[46px] rounded-sm overflow-hidden bg-zinc-950" style={{ aspectRatio: '5/7' }}>
        <Image
          src={`${XCP_IMG_BASE}/full/${o.base_asset}`}
          alt=""
          fill
          className="object-contain"
          sizes="46px"
          unoptimized
        />
      </div>
      <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-100 font-medium truncate">{name}</span>
          <span className={`text-[10px] font-semibold uppercase px-1 py-px rounded shrink-0 ${
            isBid ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isBid ? 'Buy' : 'Sell'}
          </span>
        </div>
        <span className="text-[11px] text-zinc-300 font-mono truncate">
          {displayAmount > 0 ? formatPrice(displayAmount) : '—'}
          {isFinite(o.price) && o.price > 0 ? ` @ ${formatPrice(o.price, o.quote_asset === 'BTC' && satsMode)} ${quote}` : ''}
        </span>
        {o.collection_slug && o.collection_name && (
          <CollectionChip slug={o.collection_slug} name={o.collection_name} type="trade" />
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[10px] text-zinc-500 font-mono">
          {o.block_time ? compactTime(o.block_time) : ''}
        </span>
        {isFinite(o.price) && o.price > 0 && displayAmount > 0 && (
          <span className="text-[11px] text-zinc-400 font-mono">
            {formatPrice(o.price * displayAmount, o.quote_asset === 'BTC' && satsMode)} {quote}
          </span>
        )}
      </div>
    </Link>
  )
}

function DispensersCard() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { satsMode } = useSatsMode()
  const { dispensers, isLoading: dispLoading } = useDispensersLatest({ status: 'open' }, CARD_COUNT)
  const { dispenses, isLoading: dispenseLoading } = useDispensesLatest({}, CARD_COUNT)

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
      <div>
        {tab === 0 ? (
          isLoading || dispensers.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">
              {isLoading ? 'Loading...' : 'No data'}
            </div>
          ) : dispensers.map((d, i) => (
            <DispenserRow key={d.tx_hash} d={d} satsMode={satsMode} last={i === dispensers.length - 1} />
          ))
        ) : (
          isLoading || dispenses.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">
              {isLoading ? 'Loading...' : 'No data'}
            </div>
          ) : dispenses.map((d, i) => (
            <DispenseRow key={`${d.tx_hash}-${d.dispense_index}`} d={d} satsMode={satsMode} last={i === dispenses.length - 1} />
          ))
        )}
      </div>
    </div>
  )
}

function DispenserRow({ d, satsMode, last }: { d: LatestDispenser; satsMode: boolean; last: boolean }) {
  const displayName = d.asset_longname ?? d.asset
  const unit = satsMode ? 'sats' : 'BTC'

  return (
    <Link
      href={`/dispense/${encodeURIComponent(d.asset)}`}
      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors ${last ? '' : 'border-b border-zinc-800/30'}`}
    >
      <div className="relative shrink-0 w-[46px] rounded-sm overflow-hidden bg-zinc-950" style={{ aspectRatio: '5/7' }}>
        <Image
          src={`${XCP_IMG_BASE}/full/${d.asset}`}
          alt=""
          fill
          className="object-contain"
          sizes="46px"
          unoptimized
        />
      </div>
      <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
        <span className="text-xs text-zinc-100 font-medium truncate">{displayName}</span>
        <span className="text-[11px] text-zinc-300 font-mono">
          {formatPrice(d.price, satsMode)} {unit} · {formatPrice(d.give_quantity)} per dispense
        </span>
        {d.collection_slug && d.collection_name && (
          <CollectionChip slug={d.collection_slug} name={d.collection_name} type="dispense" />
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[10px] text-zinc-500 font-mono">
          {d.block_time ? compactTime(d.block_time) : ''}
        </span>
        <span className="text-[11px] text-zinc-400 font-mono">
          {formatPrice(d.give_remaining)} left
        </span>
      </div>
    </Link>
  )
}

function DispenseRow({ d, satsMode, last }: { d: LatestDispense; satsMode: boolean; last: boolean }) {
  const displayName = d.asset_longname ?? d.asset
  const price = (d.price > 0 && isFinite(d.price)) ? d.price : (d.dispense_quantity > 0 && d.btc_amount > 0) ? d.btc_amount / d.dispense_quantity : 0
  const unit = satsMode ? 'sats' : 'BTC'

  return (
    <Link
      href={`/dispense/${encodeURIComponent(d.asset)}`}
      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors ${last ? '' : 'border-b border-zinc-800/30'}`}
    >
      <div className="relative shrink-0 w-[46px] rounded-sm overflow-hidden bg-zinc-950" style={{ aspectRatio: '5/7' }}>
        <Image
          src={`${XCP_IMG_BASE}/full/${d.asset}`}
          alt=""
          fill
          className="object-contain"
          sizes="46px"
          unoptimized
        />
      </div>
      <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
        <span className="text-xs text-zinc-100 font-medium truncate">{displayName}</span>
        <span className="text-[11px] text-zinc-300 font-mono">
          {price > 0 ? `${formatPrice(price, satsMode)} ${unit}` : '—'}
          {' · '}{formatPrice(d.dispense_quantity)} dispensed
        </span>
        {d.collection_slug && d.collection_name && (
          <CollectionChip slug={d.collection_slug} name={d.collection_name} type="dispense" />
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[10px] text-zinc-500 font-mono">
          {d.block_time ? compactTime(d.block_time) : ''}
        </span>
        {d.btc_amount > 0 && (
          <span className="text-[11px] text-zinc-400 font-mono">
            {formatPrice(satsMode ? d.btc_amount * 1e8 : d.btc_amount, false)} {unit}
          </span>
        )}
      </div>
    </Link>
  )
}
