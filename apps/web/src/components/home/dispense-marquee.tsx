'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { AnalyticsTopDispenser } from '@/lib/hooks/useAnalytics'
import { formatPrice } from '@/utils/format-price'
import { XCP_IMG_BASE } from '@/utils/constants'

/** Same floor as the quote ticker, in the unit this one counts. */
const MIN_DISPENSES = 20

export function DispenseMarquee({ topDispensers, satsMode }: { topDispensers: AnalyticsTopDispenser[]; satsMode: boolean }) {
  const rows = topDispensers.filter(
    (d) =>
      // A numeric asset id is not a name anyone recognises scrolling past.
      (d.asset_longname || !/^A\d+$/.test(d.asset)) && d.dispense_count >= MIN_DISPENSES,
  )
  if (rows.length === 0) return null

  const reps = Math.max(2, Math.ceil(8 / rows.length))
  const strip = Array<AnalyticsTopDispenser[]>(reps).fill(rows).flat()
  const doubled = [...strip, ...strip]

  const duration = `${Math.max(strip.length * 6, 40)}s`

  return (
    <div className="marquee-container overflow-hidden mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div
        className="marquee-strip flex w-max gap-4 py-2"
        style={{ '--marquee-duration': duration } as React.CSSProperties}
      >
        {doubled.map((d, i) => (
          <Link key={`${d.asset}-${i}`} href={`/${d.asset}`} className="flex items-center gap-2 shrink-0 min-w-0 px-3 hover:bg-zinc-800/50 rounded-sm transition-colors">
            <Image
              src={`${XCP_IMG_BASE}/icon/${d.asset}`}
              alt=""
              unoptimized
              width={14}
              height={14}
              className="rounded-sm"
              sizes="14px"
            />
            <span className="text-xs text-zinc-400 font-mono">{d.asset_longname ?? d.asset}</span>
            <span className="text-xs text-zinc-200 font-mono font-semibold">{d.dispense_count.toLocaleString()} dispenses</span>
            <span className="text-[10px] text-zinc-500 font-mono">{formatPrice(d.volume, satsMode)} vol</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
