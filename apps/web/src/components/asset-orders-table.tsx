'use client'

import Link from 'next/link'
import { useLatestOrders } from '@/lib/hooks/useLatestOrders'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useCompose } from '@/lib/wallet/useCompose'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { marketPath } from '@/utils/pairs'

/**
 * Open order book for one asset, across every pair it trades in.
 *
 * The connected wallet's own orders are marked and cancellable in place —
 * the one action a trader looking at this list actually wants, and the
 * reason it beats sending them to /trade to find the same row again.
 */
export function AssetOrdersTable({ asset }: { asset: string }) {
  const { address } = useWallet()
  const { orders, isLoading } = useLatestOrders('open', { asset, includeTotal: false })
  const { status, error, composeCancel } = useCompose()
  const cancelling = status === 'composing' || status === 'signing' || status === 'broadcasting'

  if (isLoading) {
    return <p className="py-12 text-center text-xs text-zinc-500">Loading orders…</p>
  }

  if (orders.length === 0) {
    return <p className="py-12 text-center text-xs text-zinc-500">No open orders for {asset}</p>
  }

  return (
    <div>
      {error && (
        <p className="border-b border-zinc-800 px-2 py-1.5 text-[11px] text-red-400">{error}</p>
      )}
      <table className="w-full whitespace-nowrap text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-950">
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="px-2 py-1.5 text-left font-normal">Pair</th>
            <th className="px-2 py-1.5 text-left font-normal">Side</th>
            <th className="px-2 py-1.5 text-right font-normal">Price</th>
            <th className="px-2 py-1.5 text-right font-normal">Remaining</th>
            <th className="px-2 py-1.5 text-right font-normal max-sm:hidden">Source</th>
            <th className="w-16 px-2 py-1.5 font-normal"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => {
            const mine = address != null && o.source === address
            const isBid = o.side === 'bid'
            return (
              // An order that trades the asset on both legs comes back once per
              // leg, so the hash alone is not unique within this list.
              <tr key={`${o.tx_hash}-${o.pair}-${i}`} className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50">
                <td className="px-2 py-1">
                  <Link href={marketPath(o.pair)} className="text-zinc-300 hover:text-green-400">
                    {o.base_asset_longname ?? o.base_asset}/{o.quote_asset}
                  </Link>
                </td>
                <td className={`px-2 py-1 font-medium ${isBid ? 'text-green-400' : 'text-red-400'}`}>
                  {isBid ? 'Buy' : 'Sell'}
                </td>
                <td className="px-2 py-1 text-right font-mono text-zinc-300">{formatAmount(o.price)}</td>
                <td className="px-2 py-1 text-right font-mono text-zinc-400">{formatAmount(o.remaining)}</td>
                <td className="px-2 py-1 text-right font-mono text-zinc-500 max-sm:hidden">
                  {mine ? <span className="text-zinc-300">You</span> : formatAddress(o.source)}
                </td>
                <td className="px-2 py-1 text-right">
                  {mine && (
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={() => composeCancel({ offer_hash: o.tx_hash })}
                      className="rounded-sm border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-red-500/50 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
