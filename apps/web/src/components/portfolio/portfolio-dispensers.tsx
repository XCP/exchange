'use client'

import Link from 'next/link'
import { usePortfolioDispensers } from '@/lib/hooks/usePortfolio'
import { DataTable, Thead, Tbody, Th, Tr, Td, TableMessage } from '@/components/ui/data-table'
import { formatPrice } from '@/utils/format-price'
import { useSatsMode } from '@/lib/sats-context'

/**
 * Your open dispensers.
 *
 * Rebuilt on the shared table primitives. It was a `grid grid-cols-5` with a
 * row of `<span>`s, which is why its columns never lined up with the same
 * data shown anywhere else on the site — and why its hover, padding and
 * header colour were all one-offs.
 */
export function PortfolioDispensers({ address }: { address: string }) {
  const { dispensers, isLoading } = usePortfolioDispensers(address)
  const { satsMode } = useSatsMode()

  return (
    <DataTable className="border-0 bg-transparent">
      <Thead>
        <Th align="left">Asset</Th>
        <Th>Price</Th>
        <Th>Per dispense</Th>
        <Th className="max-sm:hidden">Remaining</Th>
        <Th className="max-sm:hidden">Dispenses</Th>
      </Thead>
      <Tbody>
        {dispensers.map((d) => (
          <Tr key={d.tx_hash}>
            <Td>
              <Link href={`/buy/${d.asset}`} className="font-medium text-zinc-200 hover:text-green-400">
                {d.asset}
              </Link>
            </Td>
            {/* price_normalized — the raw `price` field is in satoshis. */}
            <Td num>{formatPrice(d.price_normalized, satsMode)}</Td>
            <Td num>{d.give_quantity_normalized}</Td>
            <Td num muted className="max-sm:hidden">
              {d.give_remaining_normalized}
            </Td>
            <Td num muted className="max-sm:hidden">
              {d.dispense_count}
            </Td>
          </Tr>
        ))}
        {isLoading && dispensers.length === 0 && <TableMessage cols={5}>Loading dispensers…</TableMessage>}
        {!isLoading && dispensers.length === 0 && <TableMessage cols={5}>No open dispensers</TableMessage>}
      </Tbody>
    </DataTable>
  )
}
