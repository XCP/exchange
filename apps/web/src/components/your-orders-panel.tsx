'use client'

import Link from 'next/link'
import { useWallet } from '@/lib/wallet/wallet-context'
import { usePortfolioOrders, usePortfolioDispensers } from '@/lib/hooks/usePortfolio'
import { YourSection } from '@/components/your-section'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { useSatsMode } from '@/lib/sats-context'
import { marketPath } from '@/utils/pairs'

/**
 * "Your open orders" above the Orders browse table.
 *
 * The same idea Pools already had: a browse page shows the whole network, and
 * the first thing most people want from it is their own row. Both panels read
 * from the portfolio endpoints that /portfolio already uses, so this adds a
 * surface rather than a data source.
 *
 * Only OPEN orders. A filled or expired one is history and belongs on
 * /portfolio; here it would sit above a table of live activity claiming to be
 * part of it.
 */
export function YourOrdersPanel() {
  const { status, address } = useWallet()
  const { orders, isLoading, error } = usePortfolioOrders(
    status === 'connected' ? address : null,
  )

  return (
    <YourSection
      title="Your Open Orders"
      noun="orders"
      loading={isLoading}
      error={error}
      isEmpty={orders.length === 0}
      emptyLabel="No open orders for this wallet."
    >
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="px-3 py-1.5 text-left font-normal">Pair</th>
              <th className="px-3 py-1.5 text-left font-normal">Side</th>
              <th className="px-3 py-1.5 text-right font-normal">Price</th>
              <th className="px-3 py-1.5 text-right font-normal">Remaining</th>
              <th className="px-3 py-1.5 text-right font-normal max-sm:hidden">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 10).map((o, i) => {
              const isBid = /^(buy|bid)$/i.test(o.side)
              return (
                <tr
                  key={`${o.tx_hash}-${o.pair}-${i}`}
                  className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50"
                >
                  <td className="px-3 py-1.5">
                    <Link href={marketPath(o.pair)} className="text-zinc-200 hover:text-green-400">
                      {o.pair.replace('_', '/')}
                    </Link>
                  </td>
                  <td className={`px-3 py-1.5 ${isBid ? 'text-green-400' : 'text-red-400'}`}>
                    {isBid ? 'Buy' : 'Sell'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-300">
                    {o.price != null ? formatAmount(o.price) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-400">
                    {formatAmount(o.remaining)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-500 max-sm:hidden">
                    {o.block_time ? formatTimeAgo(o.block_time) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </YourSection>
  )
}

/** "Your dispensers" above the Dispensers browse table. */
export function YourDispensersPanel() {
  const { status, address } = useWallet()
  const { satsMode } = useSatsMode()
  const { dispensers, isLoading, error } = usePortfolioDispensers(
    status === 'connected' ? address : null,
  )

  return (
    <YourSection
      title="Your Dispensers"
      noun="dispensers"
      loading={isLoading}
      error={error}
      isEmpty={dispensers.length === 0}
      emptyLabel="No dispensers opened from this wallet."
    >
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="px-3 py-1.5 text-left font-normal">Asset</th>
              <th className="px-3 py-1.5 text-right font-normal">Price</th>
              <th className="px-3 py-1.5 text-right font-normal">Per dispense</th>
              <th className="px-3 py-1.5 text-right font-normal">Remaining</th>
              <th className="px-3 py-1.5 text-right font-normal max-sm:hidden">Dispenses</th>
            </tr>
          </thead>
          <tbody>
            {dispensers.slice(0, 10).map((d) => (
              <tr
                key={d.tx_hash}
                className="border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50"
              >
                <td className="px-3 py-1.5">
                  <Link
                    href={`/${encodeURIComponent(d.asset)}`}
                    className="text-zinc-200 hover:text-green-400"
                  >
                    {d.asset}
                  </Link>
                </td>
                {/* price_normalized, never `price` — the raw field is in
                    satoshis and reads as a hundred million times the ask. */}
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-300">
                  {formatPrice(d.price_normalized, satsMode)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-400">
                  {d.give_quantity_normalized}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-400">
                  {d.give_remaining_normalized}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-zinc-500 max-sm:hidden">
                  {d.dispense_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </YourSection>
  )
}
