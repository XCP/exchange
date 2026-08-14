'use client'

import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import { dexUrl } from '@/lib/api/client'

/**
 * The aggregator-facing view of this market, shown verbatim: every value is
 * the exact decimal string reported by /coingecko/tickers (the surface the
 * reconciliation gate verifies), never recomputed in the frontend. Renders
 * nothing for pairs outside the tracked-market allowlist.
 */

interface CgTicker {
  ticker_id: string
  last_price: string
  base_volume: string
  target_volume: string
  bid: string | null
  ask: string | null
  high: string
  low: string
  last_trade_timestamp: number | null
  is_stale: boolean
}

interface CatalogEntry {
  ticker_id: string
  execution_sources: string[]
}

const SOURCE_LABELS: Record<string, string> = {
  order_book: 'Order book',
  pool: 'AMM pool',
  dispenser: 'Dispensers',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xs text-zinc-300 font-mono break-all">{value}</div>
    </div>
  )
}

export function TrackedMarketData({ pair, baseSymbol, quoteSymbol }: {
  pair: string
  baseSymbol: string
  quoteSymbol: string
}) {
  const { data: tickers } = useDexSWR<CgTicker[]>(dexUrl('/coingecko/tickers'))
  const { data: catalog } = useDexSWR<CatalogEntry[]>(dexUrl('/catalog/pairs'))
  const ticker = tickers?.find((t) => t.ticker_id === pair)
  if (!ticker) return null

  const sources = catalog?.find((c) => c.ticker_id === pair)?.execution_sources ?? []

  return (
    <div className="p-3 border-b border-zinc-800">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Tracked Market &mdash; 24h
        </div>
        {ticker.is_stale && (
          <span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            Stale
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Last Price" value={ticker.last_price} />
        <Stat
          label="Last Trade"
          value={
            ticker.last_trade_timestamp != null
              ? formatDistanceToNowStrict(ticker.last_trade_timestamp, { addSuffix: true })
              : '—'
          }
        />
        <Stat label={`Volume (${baseSymbol})`} value={ticker.base_volume} />
        <Stat label={`Volume (${quoteSymbol})`} value={ticker.target_volume} />
        <Stat label="Bid" value={ticker.bid ?? '—'} />
        <Stat label="Ask" value={ticker.ask ?? '—'} />
        <Stat label="High" value={ticker.high} />
        <Stat label="Low" value={ticker.low} />
      </div>
      {sources.length > 0 && (
        <div className="mt-2 text-[11px] text-zinc-500">
          Sources: {sources.map((s) => SOURCE_LABELS[s] ?? s).join(' · ')}
        </div>
      )}
      <div className="mt-1 flex gap-3 text-[11px]">
        <Link href="/methodology" className="text-green-400 hover:text-green-300">
          Methodology
        </Link>
        <a
          href={dexUrl('/coingecko/tickers')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-400 hover:text-green-300"
        >
          API
        </a>
      </div>
    </div>
  )
}
