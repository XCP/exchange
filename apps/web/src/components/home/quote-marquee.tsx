'use client'

import Image from 'next/image'
import type { QuoteVolume } from '@/lib/hooks/useAnalytics'
import { formatBig } from '@/utils/format-analytics'
import { XCP_IMG_BASE } from '@/utils/constants'

export function QuoteMarquee({ quoteVolumes }: { quoteVolumes: QuoteVolume[] }) {
  // Filter out subassets with no longname (show as raw numeric IDs like A1234...)
  const filtered = quoteVolumes.filter((q) => q.quote_asset_longname || !/^A\d+$/.test(q.quote_asset))
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
          <div key={`${q.quote_asset}-${i}`} className="flex items-center gap-2 shrink-0 min-w-0 px-3">
            <Image
              src={`${XCP_IMG_BASE}/icon/${q.quote_asset}`}
              alt=""
              width={14}
              height={14}
              className="rounded-sm"
              sizes="14px"
            />
            <span className="text-xs text-zinc-400 font-mono">{q.quote_asset_longname ?? q.quote_asset}</span>
            <span className="text-xs text-zinc-200 font-mono font-semibold">{q.trade_count.toLocaleString()} trades</span>
            <span className="text-[10px] text-zinc-500 font-mono">{formatBig(q.volume)} vol</span>
          </div>
        ))}
      </div>
    </div>
  )
}
