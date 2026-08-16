'use client'

import Link from 'next/link'
import { useLaunches, useLaunchStats } from '@/lib/hooks/useLaunches'

/*
 * HomeHero and its four action cards lived here until 2026-08-16. They named
 * the nav — Trade, Explore, Launch, Pool — which was the right answer while
 * the homepage was a dashboard and the wrong one once it grew a chart and a
 * trade rail: the cards then described four places to go from a page that had
 * become somewhere to act. See home-trade-hero.tsx. Recoverable from git if
 * the explanatory version is ever wanted back.
 */

/**
 * A one-line report on the newest thing here, because nothing else on the
 * homepage links to it.
 *
 * Says whichever is true: what has graduated, or — while none has — what is
 * being minted right now. Both come from xcp.fun's index; see useLaunches on
 * why that is read rather than re-derived. Renders nothing at all if the
 * index is unreachable, since a launch strip with no launches in it is worse
 * than no strip.
 */
export function LaunchStrip() {
  const { launches } = useLaunches()
  const { stats } = useLaunchStats()

  const graduated = launches.filter((l) => l.phase === 'graduated')
  const minters = stats?.activity.minters ?? 0
  const xcp = Math.round((stats?.activity.paid_xcp ?? 0) / 1e8)
  const open = stats?.counts.minting ?? 0

  if (graduated.length === 0 && open === 0) return null

  return (
    <Link
      href="/launches"
      className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 transition-colors hover:border-zinc-700"
    >
      <div className="flex items-baseline gap-2">
        <span className="rounded-sm border border-purple-500/40 bg-purple-500/10 px-1 text-[9px] font-semibold leading-[1.4] tracking-wide text-purple-300">
          XCP-69
        </span>
        <span className="text-xs text-zinc-400">
          {graduated.length > 0 ? (
            <>
              <span className="font-mono tabular-nums text-zinc-200">{graduated.length}</span>{' '}
              {graduated.length === 1 ? 'launch has' : 'launches have'} graduated to a locked pool
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums text-zinc-200">{minters}</span> addresses have
              committed <span className="font-mono tabular-nums text-zinc-200">{xcp} XCP</span> to{' '}
              <span className="font-mono tabular-nums text-zinc-200">{open}</span> launches minting
              now
            </>
          )}
        </span>
      </div>
      <span className="text-[11px] text-zinc-500">See launches →</span>
    </Link>
  )
}
