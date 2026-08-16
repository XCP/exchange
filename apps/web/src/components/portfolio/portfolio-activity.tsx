'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAddressActivity, type ActivityKind } from '@/lib/hooks/useAddressActivity'
import { DataTable, Thead, Tbody, Th, Tr, Td, TableMessage } from '@/components/ui/data-table'
import { formatTimeAgo } from '@/utils/format-time-ago'
import { XCP_IMG_BASE } from '@/utils/constants'

/**
 * Everything this wallet has done, newest first.
 *
 * The other tabs are all STATE — what you hold, what is still open. This is
 * the only one that answers "what happened", which is the question a wallet
 * owner actually asks most often, and it was the one thing the portfolio
 * could not answer at all.
 */

/** Grouped so the filter is short. A reader wants "my dispenser stuff", not
 *  nine separate verbs. */
const FILTERS: { key: string; label: string; kinds: ActivityKind[] }[] = [
  { key: 'all', label: 'All', kinds: [] },
  { key: 'trade', label: 'Trading', kinds: ['order', 'cancel', 'btcpay'] },
  { key: 'dispense', label: 'Dispensers', kinds: ['dispense_buy', 'dispense_sell', 'dispenser_open', 'dispenser_refill', 'dispenser_close'] },
  { key: 'pool', label: 'Pools', kinds: ['pool_deposit', 'pool_withdraw'] },
  { key: 'transfer', label: 'Transfers', kinds: ['send', 'receive', 'sweep'] },
  { key: 'issue', label: 'Issuance', kinds: ['issuance', 'mint', 'fairminter', 'destroy'] },
]

/** Colour carries direction, not category: green takes in, red gives out. */
const TONE: Partial<Record<ActivityKind, string>> = {
  dispense_buy: 'text-green-400',
  receive: 'text-green-400',
  mint: 'text-green-400',
  pool_withdraw: 'text-green-400',
  dispense_sell: 'text-red-400',
  send: 'text-red-400',
  pool_deposit: 'text-red-400',
  destroy: 'text-red-400',
  cancel: 'text-zinc-500',
}

const LABEL: Record<ActivityKind, string> = {
  order: 'Order',
  cancel: 'Cancel',
  dispenser_open: 'Dispenser',
  dispenser_refill: 'Refill',
  dispenser_close: 'Close',
  dispense_buy: 'Buy',
  dispense_sell: 'Sale',
  pool_deposit: 'Deposit',
  pool_withdraw: 'Withdraw',
  send: 'Send',
  receive: 'Receive',
  issuance: 'Issue',
  mint: 'Mint',
  fairminter: 'Fairminter',
  sweep: 'Sweep',
  destroy: 'Destroy',
  btcpay: 'BTC pay',
  other: '—',
}

export function PortfolioActivity({ address }: { address: string }) {
  const { activity, isLoading, error } = useAddressActivity(address)
  const [filter, setFilter] = useState('all')

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]
  const rows = active.kinds.length === 0 ? activity : activity.filter((r) => active.kinds.includes(r.kind))

  return (
    <>
      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-3 py-2">
        {FILTERS.map((f) => {
          const count = f.kinds.length === 0 ? activity.length : activity.filter((r) => f.kinds.includes(r.kind)).length
          // A filter with nothing behind it is a dead control.
          if (count === 0 && f.key !== 'all') return null
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors ${
                filter === f.key
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {f.label}
              <span className="ml-1.5 font-mono text-zinc-600">{count}</span>
            </button>
          )
        })}
      </div>

      <DataTable className="border-0 bg-transparent">
        <Thead>
          <Th align="left">Action</Th>
          <Th align="left">Detail</Th>
          <Th className="max-sm:hidden">When</Th>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.key}>
              <Td>
                <span className={`text-[11px] uppercase tracking-wide ${TONE[r.kind] ?? 'text-zinc-400'}`}>
                  {LABEL[r.kind]}
                </span>
                {r.status && r.status !== 'open' && (
                  <span className="ml-1.5 rounded-sm border border-zinc-800 px-1 text-[10px] text-zinc-500">
                    {r.status}
                  </span>
                )}
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  {r.asset && (
                    <Image
                      src={`${XCP_IMG_BASE}/icon/${r.asset}`}
                      alt=""
                      width={14}
                      height={14}
                      className="size-3.5 shrink-0 rounded-sm object-cover"
                      unoptimized
                    />
                  )}
                  {r.href ? (
                    <Link href={r.href} className="text-zinc-300 hover:text-green-400">
                      {r.summary}
                    </Link>
                  ) : (
                    <span className="text-zinc-300">{r.summary}</span>
                  )}
                </span>
              </Td>
              <Td num muted className="max-sm:hidden">
                {/* The timestamp is the link out — every row is a real
                    transaction, and this is the one place to see it whole. */}
                <a
                  href={`https://www.xcp.io/tx/${r.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-300"
                >
                  {r.time ? formatTimeAgo(r.time) : '—'}
                </a>
              </Td>
            </Tr>
          ))}
          {isLoading && rows.length === 0 && <TableMessage cols={3}>Loading activity…</TableMessage>}
          {!isLoading && error && <TableMessage cols={3}>Could not load activity.</TableMessage>}
          {!isLoading && !error && rows.length === 0 && (
            <TableMessage cols={3}>No activity for this wallet.</TableMessage>
          )}
        </Tbody>
      </DataTable>
    </>
  )
}
