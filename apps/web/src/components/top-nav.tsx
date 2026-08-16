'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DropdownMenu, DropdownLink } from '@/components/ui/dropdown-menu'

/**
 * The header's navigation, described rather than hand-assembled.
 *
 * Every entry is either a link or a menu of links, so adding a surface is a
 * line in NAV instead of another branch in the JSX. Active state is derived
 * from the path in one place — a menu lights up when any of its children is
 * the current page, which is what makes "Trade" read as selected while you
 * are on /swap.
 */
type NavLink = { label: string; href: string; hint?: string; badge?: string }
type NavEntry = NavLink | { label: string; items: NavLink[] }

const NAV: NavEntry[] = [
  {
    label: 'Trade',
    items: [
      { label: 'Swap', href: '/swap', hint: 'Market price, pool and book' },
      { label: 'Limit', href: '/limit', hint: 'Rest an order at your price' },
      { label: 'Buy', href: '/buy', hint: 'From dispensers, with BTC' },
      { label: 'Sell', href: '/sell', hint: 'Open a dispenser, for BTC' },
    ],
  },
  // Trade is what you DO, Explore is what you LOOK AT. Grouping the three
  // browse surfaces behind one label gives the nav an organising idea rather
  // than a flat list of nouns, and mirrors the shape Trade already has.
  {
    label: 'Explore',
    items: [
      { label: 'Assets', href: '/explore/assets', hint: 'Everything tradeable, by volume' },
      { label: 'Markets', href: '/explore/markets', hint: 'Every pair, ranked' },
      { label: 'Orders', href: '/explore/orders', hint: 'Resting bids and asks' },
      { label: 'Dispensers', href: '/explore/dispensers', hint: 'Every open vending machine' },
      { label: 'Pools', href: '/explore/pools', hint: 'AMM liquidity and fees' },
      // Under Explore because it is something you LOOK AT, and last because it
      // is usually empty — the mempool fills and drains every block.
      { label: 'Mempool', href: '/mempool', hint: 'Broadcast, not yet confirmed' },
    ],
  },
  // Top level, and not in the Explore menu or its tab row. Explore browses
  // what exists on Counterparty; this browses one standard's output, and the
  // badge is why it earns its own entry — "Launch" alone could mean any
  // issuance, and what is behind it is specifically the fixed-parameter kind.
  { label: 'Launch', href: '/launches', badge: 'XCP-69' },
  // Pool is the third verb, after Trade and Explore: what you do with your own
  // liquidity. Explore > Pools is every pool on the network; this is yours.
  {
    label: 'Pool',
    items: [
      { label: 'Positions', href: '/positions', hint: 'Your liquidity, pool by pool' },
      { label: 'Deposit', href: '/liquidity/deposit', hint: 'Add to a pool, earn its fee' },
      { label: 'Withdrawal', href: '/liquidity/withdrawal', hint: 'Take your share back out' },
    ],
  },
]

/** Exact match, or a child route — never a bare prefix, so /dispense would
 *  not light up /dispensers. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

const LINK_CLASS =
  'text-xs font-medium transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:text-zinc-100'

export function TopNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-3 sm:gap-4">
      {NAV.map((entry) => {
        if ('href' in entry) {
          return (
            <Link
              key={entry.label}
              href={entry.href}
              className={`flex items-baseline gap-1 ${LINK_CLASS} ${isActive(pathname, entry.href) ? 'text-zinc-100' : 'text-zinc-500'}`}
            >
              {entry.label}
              {/* Beside the word rather than superscripted above it: at 10px a
                  raised badge sits off the nav's baseline and drags the row's
                  height with it. Same size for both, aligned on the baseline. */}
              {entry.badge && (
                // xcp.fun's purple, which is the standard's colour rather
                // than ours — the badge points at someone else's guarantee.
                <span className="rounded-sm border border-purple-500/40 bg-purple-500/10 px-1 text-[9px] font-semibold leading-[1.4] tracking-wide text-purple-300">
                  {entry.badge}
                </span>
              )}
            </Link>
          )
        }

        const open = entry.items.some((i) => isActive(pathname, i.href))
        return (
          <DropdownMenu
            key={entry.label}
            className="w-52"
            trigger={
              <button
                type="button"
                className={`flex items-center gap-1 ${LINK_CLASS} ${open ? 'text-zinc-100' : 'text-zinc-500'}`}
              >
                {entry.label}
                {/* Rotates with the menu, so the control shows its own state. */}
                <svg
                  viewBox="0 0 12 12"
                  aria-hidden
                  className="size-2.5 transition-transform duration-150 group-data-[state=open]:rotate-180"
                >
                  <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            }
          >
            {entry.items.map((item) => (
              <DropdownLink
                key={item.href}
                href={item.href}
                active={isActive(pathname, item.href)}
                hint={item.hint}
              >
                {item.label}
              </DropdownLink>
            ))}
          </DropdownMenu>
        )
      })}
    </nav>
  )
}
