'use client'

import Link from 'next/link'
import { usePortfolioOrders } from '@/lib/hooks/usePortfolio'
import { DataTable, Thead, Tbody, Th, Tr, Td, TableMessage } from '@/components/ui/data-table'
import { formatAmount } from '@/utils/format-amount'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { marketPath } from '@/utils/pairs'

/** Your open orders, on the shared table primitives. */
export function PortfolioOrders({ address }: { address: string }) {
  const { orders, isLoading } = usePortfolioOrders(address)

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
        {isLoading && orders.length === 0 && <TableMessage cols={6}>Loading orders…</TableMessage>}
        {!isLoading && orders.length === 0 && <TableMessage cols={6}>No open orders</TableMessage>}
      </Tbody>
    </DataTable>
  )
}
