'use client'

import Link from 'next/link'
import { usePortfolioDispensers } from '@/lib/hooks/usePortfolio'
import { useMyPending } from '@/lib/hooks/useMempool'
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
  /**
   * Dispensers you have opened that no block has confirmed yet. Shown above
   * the confirmed rows, marked, because the question a freshly-opened
   * dispenser raises — "did that go through" — is asked immediately, and the
   * indexed table can only ever answer it after a block.
   */
  const pending = useMyPending(address, 'dispenser')

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
        {pending.map((p) => (
          <Tr key={`pending-${p.tx_hash}`}>
            <Td>
              <span className="font-medium text-zinc-400">{p.asset ?? '—'}</span>
            </Td>
            <Td>
              <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Pending
              </span>
            </Td>
            <Td num muted>
              {p.give_quantity_normalized !== null ? p.give_quantity_normalized : '—'}
            </Td>
            <Td num muted className="max-sm:hidden">—</Td>
            <Td num muted className="max-sm:hidden">in mempool</Td>
          </Tr>
        ))}
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
        {isLoading && dispensers.length === 0 && pending.length === 0 && <TableMessage cols={5}>Loading dispensers…</TableMessage>}
        {!isLoading && dispensers.length === 0 && pending.length === 0 && <TableMessage cols={5}>No open dispensers</TableMessage>}
      </Tbody>
    </DataTable>
  )
}
