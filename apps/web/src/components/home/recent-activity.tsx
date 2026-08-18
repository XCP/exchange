'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useLatestOrders, type LatestOrder } from '@/lib/hooks/useLatestOrders'
import { useDispensersLatest, useDispensesLatest, type LatestDispenser, type LatestDispense } from '@/lib/hooks/useDispensersLatest'
import { usePools } from '@/lib/hooks/usePools'
import { useMempool } from '@/lib/hooks/useMempool'
import { useSatsMode } from '@/lib/sats-context'
import { formatPrice } from '@/utils/format-price'
import { marketPath } from '@/utils/pairs'

import { XCP_IMG_BASE } from '@/utils/constants'
import { TogglePills } from './toggle-pills'
import { toSats } from '@/utils/numeric'

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

/**
 * All four venues, given equal room.
 *
 * Orders and dispensers were here first because they are what people already
 * use. Pools and the mempool are here despite being thin — 4 pools against
 * ~18,000 assets with open dispensers — and that is the point: a venue nobody
 * can see is a venue nobody uses, so ranking these panels by current volume
 * would quietly ratify the status quo. The mempool panel earns its place even
 * while empty, because "nothing pending right now" is still the site telling
 * you it is live.
 *
 * The mobileMode split stays two-up per column so the phone layout does not
 * become a four-card stack: XCP-side venues on one, BTC-side on the other.
 */
export function RecentActivity({ mobileMode }: { mobileMode?: 'xcp' | 'btc' }) {
  return (
    <>
      {/* Mempool and Pools lead, ahead of the settled feeds below.
          Mempool first because it is the only one showing the chain as it is
          right now; Pools second because it is the venue the site is trying to
          grow. Both sit above Recent Activity rather than after it, where they
          were read as an afterthought to the two established venues. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
        <div className={mobileMode === 'btc' ? 'hidden md:block' : ''}>
          <MempoolCard />
        </div>
        <div className={mobileMode === 'xcp' ? 'hidden md:block' : ''}>
          <PoolsCard />
        </div>
      </div>

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

/**
 * Pools, and what they are worth trading against.
 *
 * Four exist. Showing them anyway is deliberate: the swap form is gated on a
 * pool existing, so this panel is the only place someone learns that pools are
 * a thing they could open. The empty state says so outright rather than
 * reading as a broken feed.
 */
function PoolsCard() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { pools, isLoading } = usePools(0, CARD_COUNT, tab === 0 ? 'match_count' : 'opened_block_time', 'desc')
  const rows = pools.slice(0, CARD_COUNT)

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Pools</span>
        <div className="ml-auto">
          <TogglePills
            options={[0, 1] as const}
            value={tab}
            onChange={setTab}
            label={(i) => (i === 0 ? 'Busiest' : 'Newest')}
          />
        </div>
      </div>
      <div>
        {isLoading ? (
          <div className="text-center py-8 text-zinc-500 text-xs">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-zinc-400">No pools yet</p>
            <Link href="/liquidity/deposit" className="mt-1 inline-block text-[11px] text-green-500 hover:text-green-400">
              Open the first one →
            </Link>
          </div>
        ) : (
          rows.map((p, i) => (
            <Link
              key={p.lp_asset}
              href={`/pool/${encodeURIComponent(p.lp_asset)}`}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-900 ${i === rows.length - 1 ? '' : 'border-b border-zinc-800/60'}`}
            >
              <span className="truncate text-zinc-200">{p.display_pair ?? p.pair.replace('_', '/')}</span>
              <span className="ml-auto shrink-0 tabular-nums text-zinc-500">
                {p.match_count} {p.match_count === 1 ? 'swap' : 'swaps'}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Broadcast, not yet confirmed.
 *
 * Usually one transaction or none — the Counterparty mempool drains every
 * block. Kept on the homepage anyway because an empty mempool that is visibly
 * empty is still a heartbeat, and because it is the only panel here that
 * changes between blocks rather than because someone traded.
 */
function MempoolCard() {
  const { entries, isLoading } = useMempool()
  const rows = entries.slice(0, CARD_COUNT)

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Mempool</span>
        <Link href="/mempool" className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300">
          All →
        </Link>
      </div>
      <div>
        {isLoading && rows.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-zinc-400">Nothing pending</p>
            <p className="mt-1 text-[11px] text-zinc-600">Everything broadcast has confirmed.</p>
          </div>
        ) : (
          rows.map((e, i) => (
            <div
              key={e.tx_hash}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs ${i === rows.length - 1 ? '' : 'border-b border-zinc-800/60'}`}
            >
              <span className="shrink-0 rounded-sm border border-amber-500/30 bg-amber-500/10 px-1 text-[10px] uppercase tracking-wider text-amber-400">
                {e.kind}
              </span>
              <span className="truncate text-zinc-300">
                {e.asset ?? (e.give_asset && e.get_asset ? `${e.give_asset}→${e.get_asset}` : '—')}
              </span>
              <a
                href={`https://xcp.io/tx/${e.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto shrink-0 font-mono text-[11px] text-zinc-600 hover:text-zinc-400"
              >
                {e.tx_hash.slice(0, 6)}
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function OrdersCard() {
  const [tab, setTab] = useState<0 | 1>(0)
  const { satsMode } = useSatsMode()
  // includeTotal: false -- this card slices to CARD_COUNT and renders no
  // pagination, so the exact total was 519,986 rows read per call to produce a
  // number that is destructured away here.
  const { orders: openOrders, isLoading: openLoading } = useLatestOrders('open', { includeTotal: false })
  const { orders: filledOrders, isLoading: filledLoading } = useLatestOrders('filled', { includeTotal: false })

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
      href={marketPath(o.pair)}
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
        <span className="text-[11px] text-zinc-300 font-mono tabular-nums truncate">
          {displayAmount > 0 ? formatPrice(displayAmount) : '—'}
          {isFinite(o.price) && o.price > 0 ? ` @ ${formatPrice(o.price, o.quote_asset === 'BTC' && satsMode)} ${quote}` : ''}
        </span>
        {o.collection_slug && o.collection_name && (
          <CollectionChip slug={o.collection_slug} name={o.collection_name} type="trade" />
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
          {o.block_time ? compactTime(o.block_time) : ''}
        </span>
        {isFinite(o.price) && o.price > 0 && displayAmount > 0 && (
          <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
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
      href={`/${encodeURIComponent(d.asset)}`}
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
        <span className="text-[11px] text-zinc-300 font-mono tabular-nums">
          {formatPrice(d.price, satsMode)} {unit} · {formatPrice(d.give_quantity)} per dispense
        </span>
        {d.collection_slug && d.collection_name && (
          <CollectionChip slug={d.collection_slug} name={d.collection_name} type="dispense" />
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
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
      href={`/${encodeURIComponent(d.asset)}`}
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
        <span className="text-[11px] text-zinc-300 font-mono tabular-nums">
          {price > 0 ? `${formatPrice(price, satsMode)} ${unit}` : '—'}
          {' · '}{formatPrice(d.dispense_quantity)} dispensed
        </span>
        {d.collection_slug && d.collection_name && (
          <CollectionChip slug={d.collection_slug} name={d.collection_name} type="dispense" />
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
          {d.block_time ? compactTime(d.block_time) : ''}
        </span>
        {d.btc_amount > 0 && (
          <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
            {formatPrice(satsMode ? toSats(d.btc_amount) : d.btc_amount, false)} {unit}
          </span>
        )}
      </div>
    </Link>
  )
}
