'use client'

import Link from 'next/link'
import { usePortfolioOrders } from '@/lib/hooks/usePortfolio'
import { useMyPending } from '@/lib/hooks/useMempool'
import { DataTable, Thead, Tbody, Th, Tr, Td, TableMessage } from '@/components/ui/data-table'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { marketPath } from '@/utils/pairs'

/** Your open orders, on the shared table primitives. */
export function PortfolioOrders({ address }: { address: string }) {
  const { orders, isLoading } = usePortfolioOrders(address)
  /**
   * Orders you have broadcast that no block has confirmed yet.
   *
   * The table below is built from our indexed database, which only knows
   * confirmed state — so an order placed ten seconds ago was simply absent,
   * and the honest reading of that was "it did not work". These sit ABOVE the
   * confirmed rows, marked, because the question they answer is "did my
   * order go through" and that question is asked immediately.
   */
  const pending = useMyPending(address, 'order')

  return (
    <DataTable className="border-0 bg-transparent">
      <Thead>
        <Th align="left">Pair</Th>
        <Th align="left">Side</Th>
        <Th>Price</Th>
        <Th>Amount</Th>
        <Th className="max-sm:hidden">Remaining</Th>
        <Th className="max-sm:hidden">Placed</Th>
      </Thead>
      <Tbody>
        {pending.map((p) => (
          <Tr key={`pending-${p.tx_hash}`}>
            <Td>
              <span className="font-medium text-zinc-400">
                {p.give_asset && p.get_asset ? `${p.give_asset}/${p.get_asset}` : '—'}
              </span>
            </Td>
            <Td>
              <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Pending
              </span>
            </Td>
            {/* No derived price: give/get are raw base units and the pair's
                orientation is not settled until it is indexed. A wrong price
                here would be worse than none. */}
            <Td num muted>—</Td>
            <Td num muted>
              {p.give_quantity_normalized !== null ? formatAmount(p.give_quantity_normalized) : '—'}
            </Td>
            <Td num muted className="max-sm:hidden">—</Td>
            <Td num muted className="max-sm:hidden">in mempool</Td>
          </Tr>
        ))}
        {orders.map((o, i) => {
          // The API returns bid/ask on some routes and buy/sell on others.
          const isBid = /^(buy|bid)$/i.test(o.side)
          return (
            <Tr key={`${o.tx_hash}-${o.pair}-${i}`}>
              <Td>
                <Link href={marketPath(o.pair)} className="font-medium text-zinc-200 hover:text-green-400">
                  {o.pair.replace('_', '/')}
                </Link>
              </Td>
              <Td className={isBid ? 'text-green-400' : 'text-red-400'}>{isBid ? 'Buy' : 'Sell'}</Td>
              <Td num>{formatAmount(o.price)}</Td>
              <Td num>{formatAmount(o.amount)}</Td>
              <Td num muted className="max-sm:hidden">
                {formatAmount(o.remaining)}
              </Td>
              <Td num muted className="max-sm:hidden">
                {o.block_time ? formatTimeAgo(o.block_time) : '—'}
              </Td>
            </Tr>
          )
        })}
        {isLoading && orders.length === 0 && pending.length === 0 && <TableMessage cols={6}>Loading orders…</TableMessage>}
        {!isLoading && orders.length === 0 && pending.length === 0 && <TableMessage cols={6}>No open orders</TableMessage>}
      </Tbody>
    </DataTable>
  )
}
