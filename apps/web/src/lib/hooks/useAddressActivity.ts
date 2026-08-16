import useSWR from 'swr'
import { fetcher, counterpartyUrl } from '@/lib/api/client'

/**
 * One time-ordered feed of everything an address has done.
 *
 * Merged from three Counterparty feeds rather than one, because no single
 * endpoint covers both directions:
 *
 *  - `/transactions` is what the address SENT. Orders placed and cancelled,
 *    dispensers opened, closed and refilled, pool deposits and withdrawals,
 *    sends, issuances, mints.
 *  - `/dispenses/receives` is what it BOUGHT from someone else's dispenser.
 *  - `/dispenses/sends` is what someone else bought from ITS dispensers —
 *    activity that never appears in its own transaction list, because the
 *    buyer sent that transaction.
 *
 * All three are cheap, run in parallel, and are merged on `block_time`.
 *
 * ORDER MATCHES are the one thing on the list that cannot be dated. A match
 * is an event the protocol produces when two orders cross, and Counterparty
 * exposes matches per-order or network-wide, never per-address — and the
 * order row carries a `status` but no fill time. So a fill is reported on the
 * "Order placed" row it belongs to, which is the event that does have a
 * timestamp, rather than invented as an entry of its own at the wrong moment.
 */

export type ActivityKind =
  | 'order'
  | 'cancel'
  | 'dispenser_open'
  | 'dispenser_refill'
  | 'dispenser_close'
  | 'dispense_buy'
  | 'dispense_sell'
  | 'pool_deposit'
  | 'pool_withdraw'
  | 'send'
  | 'receive'
  | 'issuance'
  | 'mint'
  | 'fairminter'
  | 'sweep'
  | 'destroy'
  | 'btcpay'
  | 'other'

export interface ActivityRow {
  key: string
  kind: ActivityKind
  txHash: string
  time: number | null
  /** One line, already formatted for display. */
  summary: string
  /** The asset this row is about, for its icon. */
  asset: string | null
  /** Where clicking it should go, when there is somewhere useful. */
  href: string | null
  /** e.g. an order's eventual outcome, shown as a chip. */
  status?: string
}

interface Unpacked {
  message_type?: string
  message_data?: Record<string, unknown>
}

interface TxRow {
  tx_hash: string
  block_time: number | null
  transaction_type: string | null
  source: string
  destination: string | null
  btc_amount_normalized?: string
  unpacked_data?: Unpacked | null
}

interface DispenseRow {
  tx_hash: string
  /** One transaction pays every dispenser at the address whose price it
   *  covers, so a tx_hash is not unique across dispense rows. */
  dispense_index?: number
  block_time: number | null
  asset: string
  source: string
  destination: string
  dispense_quantity: number
  btc_amount_normalized?: string
  asset_info?: { divisible?: boolean }
}

const LIMIT = 100

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}
function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
/** Base units → display units, using the divisibility the API reports. */
function units(raw: unknown, divisible: unknown): number {
  return divisible === false ? n(raw) : n(raw) / 1e8
}
function fmt(v: number): string {
  if (!Number.isFinite(v)) return '0'
  return v >= 1000 ? Math.round(v).toLocaleString() : String(Number(v.toFixed(8)))
}

/**
 * Pool operations arrive as `transaction_type: "unknown"` — the node's
 * unpacker does not name them yet — so they are recognised by the shape of
 * their message instead, which is unambiguous.
 */
function poolKind(d: Record<string, unknown>): ActivityKind | null {
  if ('min_lp_quantity' in d && 'asset_a' in d && 'asset_b' in d) return 'pool_deposit'
  if ('lp_asset_id' in d && ('min_quantity_a' in d || 'min_quantity_b' in d)) return 'pool_withdraw'
  return null
}

function fromTransaction(t: TxRow, address: string, dispenserSeen: Set<string>): ActivityRow | null {
  const d = t.unpacked_data?.message_data ?? {}
  const type = t.transaction_type ?? ''
  const base = { txHash: t.tx_hash, time: t.block_time, key: `tx:${t.tx_hash}` }

  const pool = poolKind(d)
  if (pool === 'pool_deposit') {
    const a = str(d.asset_a) ?? '?'
    const b = str(d.asset_b) ?? '?'
    return {
      ...base,
      kind: pool,
      asset: a,
      href: `/liquidity/deposit/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
      summary: `Deposited ${fmt(units(d.quantity_a, (d.asset_a_info as Record<string, unknown> | undefined)?.divisible))} ${a} + ${fmt(units(d.quantity_b, (d.asset_b_info as Record<string, unknown> | undefined)?.divisible))} ${b} into the pool`,
    }
  }
  if (pool === 'pool_withdraw') {
    return { ...base, kind: pool, asset: null, href: '/positions', summary: 'Withdrew liquidity from a pool' }
  }

  switch (type) {
    case 'order': {
      const give = str(d.give_asset) ?? '?'
      const get = str(d.get_asset) ?? '?'
      return {
        ...base,
        kind: 'order',
        asset: give,
        status: str(d.status) ?? undefined,
        href: null,
        summary: `Offered ${fmt(units(d.give_quantity, (d.give_asset_info as Record<string, unknown> | undefined)?.divisible))} ${give} for ${fmt(units(d.get_quantity, (d.get_asset_info as Record<string, unknown> | undefined)?.divisible))} ${get}`,
      }
    }
    case 'cancel':
      return { ...base, kind: 'cancel', asset: null, href: null, summary: 'Cancelled an order' }
    case 'dispenser': {
      const asset = str(d.asset) ?? '?'
      // status 10 is closed; anything else opens one. A second open for an
      // asset already seen is a refill, which is how core tops one up.
      const closed = n(d.status) === 10
      const refill = !closed && dispenserSeen.has(asset)
      if (!closed) dispenserSeen.add(asset)
      return {
        ...base,
        kind: closed ? 'dispenser_close' : refill ? 'dispenser_refill' : 'dispenser_open',
        asset,
        href: `/${encodeURIComponent(asset)}`,
        summary: closed
          ? `Closed the ${asset} dispenser`
          : `${refill ? 'Refilled' : 'Opened'} a ${asset} dispenser`,
      }
    }
    case 'send':
    case 'enhanced_send':
    case 'mpma_send': {
      const asset = str(d.asset) ?? '?'
      const to = str(d.address) ?? t.destination
      const outgoing = t.source === address
      return {
        ...base,
        kind: outgoing ? 'send' : 'receive',
        asset,
        href: `/${encodeURIComponent(asset)}`,
        summary: `${outgoing ? 'Sent' : 'Received'} ${fmt(units(d.quantity, (d.asset_info as Record<string, unknown> | undefined)?.divisible))} ${asset}${outgoing && to ? ` to ${to.slice(0, 8)}…` : ''}`,
      }
    }
    case 'issuance': {
      const asset = str(d.asset) ?? '?'
      return { ...base, kind: 'issuance', asset, href: `/${encodeURIComponent(asset)}`, summary: `Issued ${asset}` }
    }
    case 'fairmint': {
      const asset = str(d.asset) ?? '?'
      return {
        ...base,
        kind: 'mint',
        asset,
        href: `/${encodeURIComponent(asset)}`,
        summary: `Minted ${fmt(units(d.quantity, (d.asset_info as Record<string, unknown> | undefined)?.divisible))} ${asset}`,
      }
    }
    case 'fairminter': {
      const asset = str(d.asset) ?? '?'
      return { ...base, kind: 'fairminter', asset, href: '/launches', summary: `Opened a fairminter for ${asset}` }
    }
    case 'sweep':
      return { ...base, kind: 'sweep', asset: null, href: null, summary: 'Swept the address' }
    case 'destroy': {
      const asset = str(d.asset) ?? '?'
      return { ...base, kind: 'destroy', asset, href: null, summary: `Destroyed ${asset}` }
    }
    case 'btcpay':
      // The BTC leg of an order match — the closest thing to a dated fill.
      return { ...base, kind: 'btcpay', asset: 'BTC', href: null, summary: 'Paid BTC to settle an order match' }
    case 'dispense':
      // Covered properly by the dispense feeds, which know the quantity.
      return null
    default:
      return null
  }
}

export function useAddressActivity(address: string | null) {
  const key = (path: string) =>
    address ? counterpartyUrl(`/addresses/${address}/${path}?limit=${LIMIT}&verbose=true`) : null

  const txs = useSWR<{ result: TxRow[] }>(key('transactions'), fetcher, { revalidateOnFocus: false })
  const bought = useSWR<{ result: DispenseRow[] }>(key('dispenses/receives'), fetcher, { revalidateOnFocus: false })
  const sold = useSWR<{ result: DispenseRow[] }>(key('dispenses/sends'), fetcher, { revalidateOnFocus: false })

  const rows: ActivityRow[] = []

  // Oldest first while classifying, so "opened" precedes "refilled".
  const seen = new Set<string>()
  const txRows = [...(txs.data?.result ?? [])].sort((a, b) => (a.block_time ?? 0) - (b.block_time ?? 0))
  for (const t of txRows) {
    const row = fromTransaction(t, address ?? '', seen)
    if (row) rows.push(row)
  }

  const dispense = (d: DispenseRow, buying: boolean): ActivityRow => ({
    key: `${buying ? 'buy' : 'sell'}:${d.tx_hash}:${d.dispense_index ?? 0}:${d.asset}`,
    kind: buying ? 'dispense_buy' : 'dispense_sell',
    txHash: d.tx_hash,
    time: d.block_time,
    asset: d.asset,
    href: `/${encodeURIComponent(d.asset)}`,
    summary: buying
      ? `Bought ${fmt(units(d.dispense_quantity, d.asset_info?.divisible))} ${d.asset} for ${d.btc_amount_normalized ?? '0'} BTC`
      : `Sold ${fmt(units(d.dispense_quantity, d.asset_info?.divisible))} ${d.asset} from your dispenser for ${d.btc_amount_normalized ?? '0'} BTC`,
  })

  for (const d of bought.data?.result ?? []) rows.push(dispense(d, true))
  for (const d of sold.data?.result ?? []) rows.push(dispense(d, false))

  rows.sort((a, b) => (b.time ?? 0) - (a.time ?? 0))

  return {
    activity: rows,
    isLoading: txs.isLoading || bought.isLoading || sold.isLoading,
    error: txs.error,
  }
}
