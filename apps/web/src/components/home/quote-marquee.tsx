'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { QuoteVolume } from '@/lib/hooks/useAnalytics'
import { formatBig } from '@/utils/format-analytics'
import { XCP_IMG_BASE } from '@/utils/constants'

/**
 * The tail is where a ticker goes wrong. A quote currency that priced three
 * trades in the history of the network is true and not worth scrolling past,
 * and a strip of them is what made this look like noise. Twenty-five rows
 * became a handful worth reading.
 */
const MIN_TRADES = 50

export function QuoteMarquee({ quoteVolumes }: { quoteVolumes: QuoteVolume[] }) {
  const filtered = quoteVolumes.filter(
    (q) =>
      // Numeric subassets show as raw A1234… ids, which name nothing.
      (q.quote_asset_longname || !/^A\d+$/.test(q.quote_asset)) && q.trade_count >= MIN_TRADES,
  )
  if (filtered.length === 0) return null

  const reps = Math.max(2, Math.ceil(8 / filtered.length))
  const strip = Array<QuoteVolume[]>(reps).fill(filtered).flat()
  const doubled = [...strip, ...strip]
  const duration = `${Math.max(strip.length * 6, 40)}s`

  return (
    <div className="marquee-container overflow-hidden mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div
        className="marquee-strip flex w-max gap-4 py-2"
        style={{ '--marquee-duration': duration } as React.CSSProperties}
      >
        {doubled.map((q, i) => (
          <Link key={`${q.quote_asset}-${i}`} href={`/${q.quote_asset}`} className="flex items-center gap-2 shrink-0 min-w-0 px-3 hover:bg-zinc-800/50 rounded-sm transition-colors">
            <Image
              src={`${XCP_IMG_BASE}/icon/${q.quote_asset}`}
              alt=""
              unoptimized
              width={14}
              height={14}
              className="rounded-sm"
              sizes="14px"
            />
            <span className="text-xs text-zinc-400 font-mono">{q.quote_asset_longname ?? q.quote_asset}</span>
            <span className="text-xs text-zinc-200 font-mono font-semibold">{q.trade_count.toLocaleString()} trades</span>
            <span className="text-[10px] text-zinc-500 font-mono">{formatBig(q.volume)} vol</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
