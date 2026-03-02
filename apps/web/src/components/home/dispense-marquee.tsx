'use client'

import Image from 'next/image'
import type { AnalyticsTopDispenser } from '@/lib/hooks/useAnalytics'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

export function DispenseMarquee({ topDispensers, satsMode }: { topDispensers: AnalyticsTopDispenser[]; satsMode: boolean }) {
  if (topDispensers.length === 0) return null

  const reps = Math.max(2, Math.ceil(8 / topDispensers.length))
  const strip = Array<AnalyticsTopDispenser[]>(reps).fill(topDispensers).flat()
  const doubled = [...strip, ...strip]

  return (
    <div className="marquee-container overflow-hidden mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div
        className="marquee-strip flex w-max gap-4 py-2"
        style={{ animation: `marquee ${Math.max(strip.length * 6, 40)}s linear infinite` }}
      >
        {doubled.map((d, i) => (
          <div key={`${d.asset}-${i}`} className="flex items-center gap-2 shrink-0 min-w-0 px-3">
            <Image
              src={`${XCP_IMG_BASE}/icon/${d.asset}`}
              alt=""
              width={14}
              height={14}
              className="rounded-sm"
              sizes="14px"
            />
            <span className="text-xs text-zinc-400 font-mono">{d.asset_longname ?? d.asset}</span>
            <span className="text-xs text-zinc-200 font-mono font-semibold">{d.dispense_count.toLocaleString()} dispenses</span>
            <span className="text-[10px] text-zinc-500 font-mono">{formatPrice(d.volume, satsMode)} vol</span>
          </div>
        ))}
      </div>
    </div>
  )
}
