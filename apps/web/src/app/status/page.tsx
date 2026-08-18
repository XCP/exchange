import type { Metadata } from 'next'
import Link from 'next/link'
import { COUNTERPARTY_API_BASE, DEX_API_BASE } from '@/utils/constants'

export const metadata: Metadata = {
  title: 'Status | XCP DEX',
  description: 'Live health of the XCP DEX market API and Counterparty indexer: indexed Bitcoin height, network tip, and lag.',
}

// Bitcoin-derived freshness is the point of this page; never serve it stale for long.
// Every /status render costs the API seven unqualified COUNT(*)s -- about a
// million rows -- and this page was asking for a fresh one every minute. The
// counters it displays move on Bitcoin's cadence, roughly one block every ten
// minutes, so a minute of freshness bought nothing and paid for it 10x over.
export const revalidate = 600

interface DexStatus {
  ok: boolean
  mode: string
  trades: number
  pairs: number
  open_orders: number
  dispenses: number
  open_dispensers: number
  indexer: Record<string, string>
}

interface CounterpartyRoot {
  result: { backend_height: number; counterparty_height: number; ledger_state: string }
}

async function load(): Promise<{ dex: DexStatus | null; network: CounterpartyRoot['result'] | null }> {
  const [dexRes, cpRes] = await Promise.allSettled([
    fetch(`${DEX_API_BASE}/status`, { next: { revalidate: 600 } }),
    fetch(`${COUNTERPARTY_API_BASE.replace(/\/v2$/, '')}/v2/`, { next: { revalidate: 60 } }),
  ])
  const dex = dexRes.status === 'fulfilled' && dexRes.value.ok ? ((await dexRes.value.json()) as DexStatus) : null
  const network =
    cpRes.status === 'fulfilled' && cpRes.value.ok
      ? ((await cpRes.value.json()) as CounterpartyRoot).result
      : null
  return { dex, network }
}

function Light({ operational, label }: { operational: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 py-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <span className={`text-sm font-medium ${operational ? 'text-emerald-400' : 'text-red-400'}`}>
        {operational ? 'Operational' : 'Unavailable'}
      </span>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 py-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <span className="text-sm font-mono text-zinc-400">{value}</span>
    </div>
  )
}

export default async function StatusPage() {
  const { dex, network } = await load()
  const indexedBlock = dex ? Number(dex.indexer.last_block_index ?? 0) : 0
  const networkTip = network?.counterparty_height ?? null
  const lag = networkTip != null && indexedBlock > 0 ? networkTip - indexedBlock : null
  const lastRun = dex?.indexer.last_run_time ? Number(dex.indexer.last_run_time) * 1000 : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-zinc-100">Status</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Freshness of the market data served at{' '}
        <a href={`${DEX_API_BASE}/status`} className="text-green-400 hover:text-green-300">
          api.xcpdex.com
        </a>
        . Refreshes every minute.
      </p>

      <div className="mt-8">
        <Light operational={dex != null && dex.ok} label="Market API" />
        <Light operational={dex != null && dex.mode === 'FOLLOWING'} label="Counterparty indexer" />
        <Light operational={network != null && network.ledger_state === 'Following'} label="Bitcoin synchronization" />
      </div>

      <div className="mt-8">
        <Fact label="Indexed Bitcoin block" value={indexedBlock > 0 ? indexedBlock.toLocaleString() : '—'} />
        <Fact label="Network tip" value={networkTip != null ? networkTip.toLocaleString() : '—'} />
        <Fact
          label="Indexer lag"
          value={lag != null ? `${lag.toLocaleString()} block${lag === 1 ? '' : 's'}` : '—'}
        />
        <Fact
          label="Last successful refresh"
          value={lastRun != null ? new Date(lastRun).toISOString() : '—'}
        />
        {dex && (
          <>
            <Fact label="Indexed trades" value={dex.trades.toLocaleString()} />
            <Fact label="Indexed dispenses" value={dex.dispenses.toLocaleString()} />
            <Fact label="Open orders" value={dex.open_orders.toLocaleString()} />
            <Fact label="Open dispensers" value={dex.open_dispensers.toLocaleString()} />
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-zinc-600">
        Market data methodology:{' '}
        <Link href="/methodology" className="text-green-400 hover:text-green-300">
          xcpdex.com/methodology
        </Link>{' '}
        · API reference:{' '}
        <a href="https://api.xcpdex.com/openapi.json" className="text-green-400 hover:text-green-300">
          openapi.json
        </a>
      </p>
    </div>
  )
}
