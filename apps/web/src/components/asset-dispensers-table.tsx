'use client'

import { useSatsMode } from '@/lib/sats-context'
import { formatAddress } from '@/utils/format-address'
import { formatPrice, formatBtcAmount } from '@/utils/format-price'
import type { Dispenser } from '@/types/trading'
import { fromSats } from '@/utils/numeric'

/**
 * Open dispensers for one asset, cheapest first — the sell side of a
 * dispenser market.
 *
 * A row is clickable when the page can act on it: on /buy that selects
 * the dispenser to buy from, which is why the list is ordered by price
 * rather than by recency.
 */
export function AssetDispensersTable({
  dispensers,
  isLoading,
  asset,
  onSelect,
}: {
  dispensers: Dispenser[]
  isLoading: boolean
  asset: string
  /** Receives the index into the price-sorted list. */
  onSelect?: (index: number) => void
}) {
  const { satsMode } = useSatsMode()

  if (isLoading) {
    return <p className="py-12 text-center text-xs text-zinc-500">Loading dispensers…</p>
  }

  if (dispensers.length === 0) {
    return <p className="py-12 text-center text-xs text-zinc-500">No open dispensers for {asset}</p>
  }

  return (
    <table className="w-full whitespace-nowrap text-xs">
      <thead className="sticky top-0 z-10 bg-zinc-950">
        <tr className="border-b border-zinc-800 text-zinc-500">
          <th className="px-2 py-1.5 text-left font-normal">Price</th>
          <th className="px-2 py-1.5 text-right font-normal">Per dispense</th>
          <th className="px-2 py-1.5 text-right font-normal">Remaining</th>
          <th className="px-2 py-1.5 text-right font-normal max-sm:hidden">Source</th>
        </tr>
      </thead>
      <tbody>
        {dispensers.map((d, i) => (
          <tr
            key={d.tx_hash}
            onClick={onSelect ? () => onSelect(i) : undefined}
            className={`border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-900 ${onSelect ? 'cursor-pointer' : ''}`}
          >
            <td className="px-2 py-1 font-mono text-zinc-300">
              {formatBtcAmount(fromSats(d.satoshi_price), satsMode, false)}
            </td>
            <td className="px-2 py-1 text-right font-mono text-green-400">
              {formatPrice(d.give_quantity_normalized)}
            </td>
            <td className="px-2 py-1 text-right font-mono text-zinc-400">
              {formatPrice(d.give_remaining_normalized)}
            </td>
            <td className="px-2 py-1 text-right font-mono text-zinc-500 max-sm:hidden">
              {formatAddress(d.source)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
