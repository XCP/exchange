'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAssetTrades, type AssetVenue } from '@/lib/hooks/useAssetTrades'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { formatAddress } from '@/utils/format-address'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { useSatsMode } from '@/lib/sats-context'

const VENUES: [AssetVenue, string][] = [
  ['all', 'All'],
  ['dex', 'DEX'],
  ['dispensers', 'Dispensers'],
]

const KIND_LABEL: Record<string, string> = {
  order: 'Book',
  pool: 'Pool',
  dispense: 'Dispenser',
}

/**
 * This asset's trade history, across every pair and venue.
 *
 * The column that makes it work is Quote. Rows are not all denominated in the
 * same thing — a book fill might be in XCP, the next row in BITCRYSTALS, a
 * dispense in BTC — so the price is meaningless without naming its unit on
 * every line. Sorting them into one chronological list only helps if each row
 * says what it is measured in.
 *
 * Side reads from the asset's perspective throughout, which is why a dispense
 * is always a buy: someone acquired this asset for bitcoin.
 */
export function AssetTradeHistory({ asset }: { asset: string }) {
  const [venue, setVenue] = useState<AssetVenue>('all')
  const { trades, isLoading } = useAssetTrades(asset, venue)
  const { satsMode } = useSatsMode()

  return (
    <section className="rounded-sm border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Trade history
        </h2>
        <div className="flex items-center gap-0.5">
          {VENUES.map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVenue(v)}
              className={`rounded-sm px-2 py-0.5 font-mono text-[10px] transition-colors ${
                venue === v ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && trades.length === 0 ? (
        <p className="py-10 text-center text-xs text-zinc-500">Loading…</p>
      ) : trades.length === 0 ? (
        <p className="py-10 text-center text-xs text-zinc-500">
          No trades recorded for this asset.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-1.5 text-left font-normal">Time</th>
                <th className="px-3 py-1.5 text-left font-normal">Venue</th>
                <th className="px-3 py-1.5 text-left font-normal">Side</th>
                <th className="px-3 py-1.5 text-right font-normal">Amount</th>
                <th className="px-3 py-1.5 text-right font-normal">Price</th>
                <th className="px-3 py-1.5 text-left font-normal">Quote</th>
                <th className="px-3 py-1.5 text-left font-normal">Address</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                // (kind, id), not tx_hash: one tx can carry several fills —
                // two same-tx pool sweeps collided under the old key.
                <tr key={`${t.kind}-${t.id}`} className="border-b border-zinc-900 last:border-b-0">
                  <td className="px-3 py-1.5 text-zinc-400">{formatTimeAgo(t.block_time)}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{KIND_LABEL[t.kind] ?? t.kind}</td>
                  <td className="px-3 py-1.5">
                    <span className={t.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                      {t.side === 'buy' ? 'Buy' : 'Sell'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-200">
                    {formatAmount(t.amount)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                    {/* Only the BTC-denominated rows respond to the sats switch;
                        an XCP price has no satoshis to express. */}
                    {t.quote_asset === 'BTC'
                      ? formatPrice(t.price, satsMode)
                      : formatPrice(t.price)}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500">
                    {t.quote_asset === 'BTC' && satsMode ? 'sats' : t.quote_asset}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-zinc-500">
                    {t.counterparty ? (
                      <Link
                        href={`/portfolio?address=${t.counterparty}`}
                        className="transition-colors hover:text-zinc-300"
                      >
                        {formatAddress(t.counterparty)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
