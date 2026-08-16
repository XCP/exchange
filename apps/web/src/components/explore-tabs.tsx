'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

/**
 * The tab row shared by every Explore surface.
 *
 * Orders, Dispensers and Pools answer one question — where is the liquidity
 * for this asset — from three venues. As separate pages that comparison cost
 * a full navigation each time; as tabs it is one click, and the surfaces
 * already shared their chrome (see components/browse-controls).
 *
 * The selected timeframe rides along. It is read from `window.location` at
 * CLICK time rather than from `useSearchParams`, because the pages update it
 * with the History API to avoid remounting themselves — a write React's hook
 * cannot see. Reading it late is what keeps the hand-off correct.
 */
/**
 * Two groups, and the gap between them is doing work.
 *
 * Assets and Markets are OBJECTS — the things being traded, and the pairs
 * they trade in. Orders, Dispensers and Pools are VENUES — the three places
 * an order can actually meet a counterparty on Counterparty. Reading them as
 * one flat list of five nouns invites the question "is a market a kind of
 * pool", which they are not; the divider says they answer different
 * questions.
 *
 * Launches is deliberately NOT here. Every tab above browses what exists on
 * the network; /launches browses one standard's output, and it lives in the
 * main nav where its badge can say which standard.
 */
const TABS = [
  { label: 'Assets', href: '/explore/assets' },
  { label: 'Markets', href: '/explore/markets' },
  { label: 'Orders', href: '/explore/orders', startsGroup: true },
  { label: 'Dispensers', href: '/explore/dispensers' },
  { label: 'Pools', href: '/explore/pools' },
] as const

export function ExploreTabs() {
  const pathname = usePathname()
  const router = useRouter()

  const go = (href: string) => {
    const tf = new URLSearchParams(window.location.search).get('tf')
    router.push(tf ? `${href}?tf=${tf}` : href)
  }

  return (
    <div className="border-b border-zinc-800 px-4">
      <nav className="flex items-center gap-5">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`)
          return (
            <Fragment key={t.href}>
              {'startsGroup' in t && t.startsGroup && (
                <span aria-hidden className="h-3 w-px self-center bg-zinc-800" />
              )}
            <Link
              href={t.href}
              // The plain href stays for middle-click, SSR and hover preview;
              // the handler adds the live timeframe for an ordinary click.
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                e.preventDefault()
                go(t.href)
              }}
              className={`border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? 'border-green-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </Link>
            </Fragment>
          )
        })}
      </nav>
    </div>
  )
}
