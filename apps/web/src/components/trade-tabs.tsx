'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { determineBaseQuote } from '@/utils/pairs'

/**
 * The tab row shared by every trading surface, matching Explore's.
 *
 * An ADDITIONAL layer, not a replacement: each page keeps the tab row above
 * its form. Those two rows are a hierarchy — which surface, then what to do
 * on it — where before, reaching a sibling surface meant going back up to the
 * header dropdown.
 *
 * BTC Dispenser is ONE entry covering two routes. Splitting it gave the row two
 * problems at once: /limit's own tab row already says Buy | Sell and means an
 * order side on the book by it, and /buy//sell have a Buy | Sell row of their
 * own that does the same job the split entry would. Naming the mechanism once
 * says what a reader actually needs — this is the vending-machine venue, not
 * the book — and the page's own tabs pick the direction, which is exactly
 * where that choice already lived.
 *
 * The pair travels with you. Clicking Limit from /swap/XCP/PEPECASH lands on
 * /limit/PEPECASH rather than an empty form. This is the ONLY carrying of
 * context between forms: it comes from the URL you are already on, so it is
 * visible and deliberate, unlike a stored last-used asset that reappears days
 * later with no explanation.
 */
const TABS = [
  { label: 'Swap', href: '/swap', match: ['/swap'] },
  { label: 'Limit', href: '/limit', match: ['/limit'] },
  // Lands on Buy, the overwhelmingly common side; the form's own row opens
  // the other. Lit for both so /sell never looks like it left the section.
  { label: 'BTC Dispenser', href: '/buy', match: ['/buy', '/sell'], startsGroup: true },
  // The venue's other half: the dispenser sells you an asset for BTC, the
  // pool lets you BE the seller in XCP. Named for the currency the way its
  // neighbour is, so the pair reads as two ways of standing on either side.
  { label: 'XCP Liquidity', href: '/liquidity', match: ['/liquidity'] },
] as const

/**
 * The asset the current page is ABOUT, ignoring whichever side is money.
 *
 * `/swap/XCP/PEPECASH` and `/limit/PEPECASH` are both about PEPECASH, and
 * that is what should survive a hop between them. Two-legged routes settle it
 * with the same base/quote rule the indexer uses, so the answer agrees with
 * what the rest of the site calls the base.
 */
function subjectAsset(pathname: string): string | null {
  const [route, ...segments] = pathname.split('/').filter(Boolean)
  if (!route) return null
  // /liquidity puts a verb before its pair. Drop it, or the base/quote rule
  // would be handed the word "deposit" and asked which asset it is.
  const rest = route === 'liquidity' ? segments.slice(1) : segments
  if (rest.length === 0) return null
  let assets: string[]
  try {
    assets = rest.map(decodeURIComponent)
  } catch {
    return null
  }
  if (assets.length === 1) return assets[0]
  return determineBaseQuote(assets[0], assets[1]).base
}

/** Where a tab points given what the current page is about. */
function hrefFor(base: string, subject: string | null): string {
  // Nothing to carry, or the subject IS the money — the bare form is right.
  if (!subject || subject === 'XCP' || subject === 'BTC') return base
  const asset = encodeURIComponent(subject)
  // Swap needs both legs and assumes XCP for the one it wasn't told about.
  if (base === '/swap') return `/swap/XCP/${asset}`
  // Liquidity needs a verb before them, and deposit is the one you arrive to do.
  if (base === '/liquidity') return `/liquidity/deposit/XCP/${asset}`
  return `${base}/${asset}`
}

export function TradeTabs() {
  const pathname = usePathname()
  const subject = subjectAsset(pathname)

  return (
    <div className="border-b border-zinc-800 px-4">
      <nav className="flex items-center gap-5">
        {TABS.map((t) => {
          const active = t.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))
          return (
            <div key={t.href} className="contents">
              {/* Pool and book on the left, dispensers on the right: the
                  first two settle in XCP against a counterparty, the last
                  two in BTC against a vending machine. */}
              {'startsGroup' in t && t.startsGroup && (
                <span aria-hidden className="h-3 w-px self-center bg-zinc-800" />
              )}
              <Link
                href={hrefFor(t.href, subject)}
                className={`border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? 'border-green-500 text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
              </Link>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
