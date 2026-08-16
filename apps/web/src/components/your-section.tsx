'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useConnectFlow } from '@/lib/wallet/useConnectFlow'
import { formatAddress } from '@/utils/format-address'

/**
 * "Your X" above a browse table — your orders, your dispensers, your pools.
 *
 * One component for all three because the states are the same four every
 * time (disconnected, loading, failed, empty) and they were drifting: Pools
 * said "Wallet not connected" with no way to connect from there, which names
 * the problem and then withholds the fix.
 *
 * Deliberately short. /positions is a destination and can afford a centred
 * hero; this is a strip above someone else's table, so the connect prompt is
 * one row — the whole point of the section is what sits below it.
 */
export function YourSection({
  title,
  /** What this section would hold, for the disconnected line. */
  noun,
  loading,
  error,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string
  noun: string
  loading?: boolean
  error?: unknown
  isEmpty?: boolean
  emptyLabel: string
  children: ReactNode
}) {
  const { status, address } = useWallet()
  const wallet = useConnectFlow()
  const connected = status === 'connected' && !!address

  return (
    <section className="mb-6 rounded-sm border border-zinc-800 bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <div className="text-xs font-medium text-zinc-300">{title}</div>
          <div className="font-mono text-[11px] text-zinc-500">
            {connected ? formatAddress(address) : `Connect to see your ${noun}`}
          </div>
        </div>
        {!connected && (
          <button
            type="button"
            onClick={wallet.start}
            disabled={wallet.connecting}
            className="rounded-sm border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-50"
          >
            {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
      </div>

      {/* Nothing below the header until there is a wallet: an empty table with
          headings reads as "you have none" rather than "I cannot know yet". */}
      {connected &&
        (error ? (
          <div className="px-3 py-4 text-xs text-zinc-500">Could not load your {noun}.</div>
        ) : loading ? (
          <div className="px-3 py-4 text-xs text-zinc-500">Loading your {noun}…</div>
        ) : isEmpty ? (
          <div className="px-3 py-4 text-xs text-zinc-500">{emptyLabel}</div>
        ) : (
          children
        ))}

      {wallet.installModal}
    </section>
  )
}

/** The accent action a browse page offers — create the thing it lists. */
export function CreateAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-sm bg-green-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-950 transition-colors hover:bg-green-400"
    >
      {label}
    </Link>
  )
}
