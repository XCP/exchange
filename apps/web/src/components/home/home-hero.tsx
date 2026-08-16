'use client'

import Link from 'next/link'
import { RiSwapLine, RiCompass3Line, RiRocketLine, RiDropLine } from 'react-icons/ri'
import { useLaunches, useLaunchStats } from '@/lib/hooks/useLaunches'

/**
 * What this site is, and the four things you can do on it.
 *
 * The homepage was titled "Dashboard" and opened on eight counter cards. That
 * is a fine second screen and a poor first one: it assumes you already know
 * what Counterparty is, that this is a DEX for it, and which of its four
 * surfaces you wanted. Someone arriving cold got metrics about a thing nobody
 * had named.
 *
 * The four cards are the nav, spelled out. They are not decoration — Trade,
 * Explore, Launch and Pool is the structure the whole site is organised by,
 * and the homepage was the only page that never said so.
 */
const ACTIONS = [
  {
    href: '/swap',
    label: 'Swap',
    detail: 'Trade any asset against XCP, through the order book and AMM pools at once.',
    Icon: RiSwapLine,
  },
  {
    href: '/explore/assets',
    label: 'Explore',
    detail: 'Every asset, market, order, dispenser and pool on the network.',
    Icon: RiCompass3Line,
  },
  {
    href: '/launches',
    label: 'Launch',
    detail: 'XCP-69 launches: fixed terms, all-or-nothing, liquidity locked forever.',
    badge: 'XCP-69',
    Icon: RiRocketLine,
  },
  {
    href: '/liquidity/deposit',
    label: 'Pool',
    detail: 'Provide liquidity and earn a share of every swap the pool settles.',
    Icon: RiDropLine,
  },
]

export function HomeHero() {
  return (
    <div className="mb-6">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">
        Peer-to-peer trading on Bitcoin
      </h1>
      <p className="max-w-2xl text-xs leading-relaxed text-zinc-500">
        Counterparty is a protocol built into Bitcoin transactions. Its exchange settles on-chain
        with no custodian and no counterparty risk — your keys sign every trade, and nothing sits
        with us in between.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex gap-3 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-3 transition-colors hover:border-zinc-700"
          >
            {/* The card's only graphic, and the reason it is here: four
                paragraphs of grey text was the whole of what a first-time
                visitor saw above the fold. Muted until hover, so the row
                reads as one object rather than four competing buttons. */}
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-500 transition-colors group-hover:border-zinc-700 group-hover:text-green-400">
              <a.Icon className="text-base" aria-hidden />
            </span>
            <span className="min-w-0">
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-zinc-100 group-hover:text-green-400">
                {a.label}
              </span>
              {a.badge && (
                <span className="rounded-sm border border-purple-500/40 bg-purple-500/10 px-1 text-[9px] font-semibold leading-[1.4] tracking-wide text-purple-300">
                  {a.badge}
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">{a.detail}</p>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

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
