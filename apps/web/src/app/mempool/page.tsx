'use client'

import Link from 'next/link'
import { useMempool, type MempoolEntry } from '@/lib/hooks/useMempool'
import { formatAmount } from '@/utils/format-amount'

/**
 * What Counterparty has seen but Bitcoin has not yet confirmed.
 *
 * Deliberately its own page rather than replacing a browse table. The
 * Counterparty mempool is usually SMALL — sampled repeatedly at one
 * transaction — because it drains every block and Counterparty volume is a
 * fraction of Bitcoin's. A panel that is empty most of the time is worse than
 * no panel where a browse table used to be, but as its own destination
 * "nothing pending" is a real and useful answer.
 */

/** Colour by what the transaction DOES, so the feed is scannable at a glance. */
const KIND_STYLE: Record<string, { label: string; tone: string }> = {
  order: { label: 'Order', tone: 'text-green-400 border-green-500/30 bg-green-500/10' },
  match: { label: 'Match', tone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  dispense: { label: 'Dispense', tone: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  dispenser: { label: 'Dispenser', tone: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  send: { label: 'Send', tone: 'text-sky-400 border-sky-500/30 bg-sky-500/10' },
  issuance: { label: 'Issuance', tone: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  destruction: { label: 'Destroy', tone: 'text-red-400 border-red-500/30 bg-red-500/10' },
  sweep: { label: 'Sweep', tone: 'text-zinc-300 border-zinc-600 bg-zinc-800/60' },
}

function ago(ts: number | null): string {
  if (!ts) return '—'
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

/** What the transaction is actually doing, in one line, per kind. */
function describe(e: MempoolEntry): string {
  if (e.kind === 'order' && e.give_asset && e.get_asset) {
    return `${formatAmount(e.give_quantity ?? 0)} ${e.give_asset} → ${formatAmount(e.get_quantity ?? 0)} ${e.get_asset}`
  }
  if (e.kind === 'dispense' && e.asset) {
    return `${formatAmount(e.give_quantity ?? 0)} ${e.asset}`
  }
  if (e.asset) return e.asset
  if (e.give_asset) return e.give_asset
  return '—'
}

export default function MempoolPage() {
  const { entries, isLoading, upstreamOk } = useMempool()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Mempool</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Broadcast, not yet confirmed. Anything here can still be replaced or dropped —
          it is not settled until it is in a block.
        </p>
      </div>

      {!upstreamOk && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Could not reach the Counterparty node just now. This list may be incomplete.
        </div>
      )}

      {isLoading && entries.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-xs text-zinc-500">
          Checking…
        </div>
      ) : entries.length === 0 ? (
        /* An empty mempool is the NORMAL state, so it reads as a fact rather
           than a failure. Saying why avoids it looking like a broken feed. */
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <p className="text-sm text-zinc-300">Nothing pending</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
            Every Counterparty transaction currently broadcast has been confirmed. This is
            the usual state between blocks — the mempool fills and drains roughly every ten
            minutes.
          </p>
          <Link
            href="/explore/markets"
            className="mt-4 inline-block rounded-sm border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            Browse markets
          </Link>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => {
            const style = KIND_STYLE[e.kind] ?? KIND_STYLE.sweep
            return (
              <li
                key={e.tx_hash}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.tone}`}
                  >
                    {style.label}
                  </span>
                  <span className="truncate text-xs text-zinc-300">{describe(e)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-[11px] text-zinc-500">{ago(e.timestamp)}</span>
                  <a
                    href={`https://www.xcp.io/tx/${e.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
                  >
                    {e.tx_hash.slice(0, 8)}
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
