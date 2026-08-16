'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Dialog as D } from 'radix-ui'
import { useSearch } from '@/lib/hooks/useSearch'
import { useMarkets } from '@/lib/hooks/useMarkets'
import { formatAmount } from '@/utils/format-amount'
import { XCP_IMG_BASE } from '@/utils/constants'
import { marketPath } from '@/utils/pairs'

/**
 * The search palette.
 *
 * A dialog rather than a dropdown under the input, for the reason launchpad
 * landed on: once results carry categories and a metric column they need room,
 * and a panel that owns the screen can be driven entirely from the keyboard.
 *
 * Scoped to things you can TRADE — markets, dispensers, pools, and assets that
 * have none of those yet. Transaction hashes and addresses are deliberately
 * absent: that is a block explorer's question, and mixing it in makes the
 * common case harder to scan.
 *
 * Unlike launchpad this filters server-side. Launchpad can hold its whole
 * index in the page because it lists one project's launches; every Counterparty
 * asset does not fit, so /search does the work and this ranks what comes back.
 */

type Category = 'markets' | 'dispensers' | 'pools' | 'assets'

interface Row {
  key: string
  category: Category
  /** Icon asset. */
  icon: string
  title: string
  subtitle: string
  /** Right-aligned figure, meaningful for this category. */
  metric: string
  href: string
}

const CATEGORY_LABEL: Record<Category, string> = {
  markets: 'Markets',
  dispensers: 'Dispensers',
  pools: 'Pools',
  assets: 'Assets',
}

/**
 * How well a row's NAME answers the query, lower being better.
 *
 * Exact beats prefix beats substring — typing "STAR" should put STAR above
 * STARMONEY above MYSTARS, which plain substring matching gets wrong in all
 * three positions. Both the display name and the protocol asset are checked,
 * so a subasset is findable by either half of its identity.
 */
function relevance(row: Row, q: string): number {
  const title = row.title.toUpperCase()
  const icon = row.icon.toUpperCase()
  if (title === q || icon === q) return 0
  if (title.startsWith(q) || icon.startsWith(q)) return 1
  if (title.includes(q) || icon.includes(q)) return 2
  return 3
}

/**
 * The tiebreak when two rows answer the query equally well.
 *
 * This happens constantly: search PEPECASH and it is an exact match as a
 * market, a dispenser AND a pool. Volume cannot decide it — market volume is
 * in XCP, dispenser volume in BTC, pool activity is a trade count, and
 * comparing them would be inventing a number.
 *
 * So the tiebreak is where someone is most likely to want to act, which is
 * also roughly decreasing liquidity: an order book first, then dispensers,
 * then AMM pools. Assets is last by construction — it only ever holds things
 * with no market at all, so it is the "nothing else matched" bucket and should
 * never outrank something tradeable.
 *
 * Within one category the server has already ordered by that category's own
 * measure (volume, or activity for pools), and Array.sort is stable, so that
 * ordering survives untouched.
 */
const CATEGORY_RANK: Record<Category, number> = {
  markets: 0,
  dispensers: 1,
  pools: 2,
  assets: 3,
}

/** The form surfaces search can keep you inside. */
type Surface = 'swap' | 'limit' | 'buy' | 'sell'

/**
 * The category a surface opens on.
 *
 * "All" is the honest default with no context, but it is a poor one inside a
 * workflow: searching from /buy, an order-book market is not something that
 * page can act on, so leading with markets buries the dispensers the user
 * came for. Falls back to All when the preferred category returns nothing.
 */
const SURFACE_DEFAULT_CATEGORY: Record<Surface, Category> = {
  swap: 'markets',
  limit: 'markets',
  buy: 'dispensers',
  sell: 'dispensers',
}

/**
 * Which categories each surface can actually host.
 *
 * Context-awareness is only helpful where the venue matches. A dispenser
 * result on /limit cannot stay on /limit — dispensers are not an order book,
 * and quietly routing there would land the user on a form that can't trade
 * the thing they picked. So a row keeps the current surface when that surface
 * can host its category, and otherwise goes to its own natural home.
 */
const SURFACE_HOSTS: Record<Surface, Category[]> = {
  // Both are XCP-quoted venues, and a pool is something /swap routes through.
  swap: ['markets', 'pools'],
  limit: ['markets'],
  buy: ['dispensers'],
  sell: ['dispensers'],
}

function currentSurface(pathname: string): Surface | null {
  for (const s of ['swap', 'limit', 'buy', 'sell'] as Surface[]) {
    if (pathname === `/${s}` || pathname.startsWith(`/${s}/`)) return s
  }
  return null
}

export function SearchPalette() {
  const router = useRouter()
  const pathname = usePathname()
  // Search should not eject you from what you were doing: picking an asset
  // while on /limit keeps you on /limit with that asset loaded.
  const surface = currentSurface(pathname)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  // Set when the panel opens and whenever the preferred category gains or
  // loses results, so the first thing shown is the thing this page trades.
  const [pinned, setPinned] = useState(false)
  const [cursor, setCursor] = useState(0)

  const { data, isLoading } = useSearch(query.trim(), category)
  // With an empty box, offer what is actually trading rather than a blank
  // panel — the same reasoning as the asset picker.
  const { markets: topMarkets } = useMarkets({ timeframe: '24h', limit: 8 })

  /**
   * ⌘K / Ctrl-K and `/` from anywhere — both conventions for this control,
   * and `/` is the one the trigger advertises.
   *
   * `/` is a printable character, so unlike ⌘K it has to yield wherever the
   * user could be typing: an input, a textarea, a contenteditable, or a
   * select. Every amount field on this site would otherwise swallow a
   * keystroke and pop a dialog instead. A modifier held means the user is
   * reaching for a browser shortcut, so leave those alone too.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (
        el?.isContentEditable ||
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        return
      }
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const browsing = query.trim().length < 2

  // Counts drive both the chip row and the default, so derive them once.
  const counts = useMemo(
    () => ({
      markets: data?.pairs.length ?? 0,
      dispensers: data?.dispensers.length ?? 0,
      pools: data?.pools.length ?? 0,
      assets: data?.assets.length ?? 0,
    }),
    [data],
  )

  // Snap to the surface's category the first time results arrive for a query;
  // after that the user's own chip choice sticks until the panel closes.
  const preferred = surface ? SURFACE_DEFAULT_CATEGORY[surface] : null
  if (!browsing && !pinned && preferred && counts[preferred] > 0) {
    setPinned(true)
    setCategory(preferred)
  }

  const rows = useMemo<Row[]>(() => {
    // Defined inside so the memo owns it — a closure from the component body
    // is a new function each render and defeats memoization entirely.
    const hosts = (c: Category) => (surface ? SURFACE_HOSTS[surface].includes(c) : false)
    if (browsing) {
      return topMarkets.map((m) => ({
        key: `m-${m.pair}`,
        category: 'markets' as const,
        icon: m.base_asset,
        title: `${m.base_asset_longname ?? m.base_asset} / ${m.quote_asset}`,
        subtitle: 'Market',
        metric: m.volume != null ? `${formatAmount(m.volume)} ${m.quote_asset}` : '—',
        href: hosts('markets') && surface === 'limit'
          ? `/limit/${encodeURIComponent(m.base_asset_longname ?? m.base_asset)}`
          : `/swap/${encodeURIComponent(m.quote_asset)}/${encodeURIComponent(m.base_asset_longname ?? m.base_asset)}`,
      }))
    }
    if (!data) return []

    const markets: Row[] = data.pairs.map((p) => ({
      key: `m-${p.pair}`,
      category: 'markets',
      icon: p.base_asset,
      // The PAIR is what identifies a market. RARECORN appears three times in
      // a search for it — against BITCORN, against XCP, and as a dispenser —
      // and a title of just "RARECORN" makes those three indistinguishable.
      title: `${p.base_asset_longname ?? p.base_asset} / ${p.quote_asset}`,
      subtitle:
        p.trade_count_24h != null && p.trade_count_24h > 0
          ? `Market · ${p.trade_count_24h} trade${p.trade_count_24h === 1 ? '' : 's'} today`
          : 'Market',
      metric:
        p.last_price != null ? `${formatAmount(p.last_price)} ${p.quote_asset}` : 'no trades',
      // The row's own quote is carried across rather than assuming XCP, so
      // picking an ASSET/BITCORN market does not silently become ASSET/XCP.
      href: hosts('markets')
        ? surface === 'swap'
          ? `/swap/${encodeURIComponent(p.quote_asset)}/${encodeURIComponent(p.base_asset_longname ?? p.base_asset)}`
          : `/limit/${encodeURIComponent(p.base_asset_longname ?? p.base_asset)}${
              p.quote_asset === 'XCP' ? '' : `/${encodeURIComponent(p.quote_asset)}`
            }`
        : marketPath(p.pair),
    }))

    const dispensers: Row[] = data.dispensers.map((d) => ({
      key: `d-${d.asset}`,
      category: 'dispensers',
      icon: d.asset,
      title: d.asset_longname ?? d.asset,
      subtitle: `Dispensers · ${d.active_dispensers} open`,
      metric: d.cheapest_price != null ? `${formatAmount(d.cheapest_price)} BTC` : '—',
      href: `/${hosts('dispensers') && surface === 'sell' ? 'sell' : 'buy'}/${encodeURIComponent(
        d.asset_longname ?? d.asset,
      )}`,
    }))

    const pools: Row[] = data.pools.map((p) => {
      // On /swap a pool is a venue, not a destination — but only when XCP is
      // one leg, since that is the pair the swap form can quote. Otherwise the
      // pool's own page is the honest answer.
      const xcpLeg = p.asset_a === 'XCP' || p.asset_b === 'XCP'
      const other = p.asset_a === 'XCP' ? p.asset_b : p.asset_a
      return {
        key: `p-${p.lp_asset}`,
        category: 'pools' as const,
        icon: p.asset_a,
        title: `${p.asset_a}/${p.asset_b}`,
        subtitle: 'Pool · AMM liquidity',
        metric: `${formatAmount(p.match_count)} trades`,
        href:
          hosts('pools') && xcpLeg
            ? `/swap/XCP/${encodeURIComponent(other)}`
            : `/pool/${p.lp_asset}`,
      }
    })

    // Only assets with nothing above them — otherwise every match appears
    // twice and the list stops being scannable.
    const covered = new Set([
      ...data.pairs.map((p) => p.base_asset),
      ...data.dispensers.map((d) => d.asset),
      ...data.pools.flatMap((p) => [p.asset_a, p.asset_b]),
    ])
    const assets: Row[] = data.assets
      .filter((a) => !covered.has(a.asset))
      .map((a) => ({
        key: `a-${a.asset}`,
        category: 'assets',
        icon: a.asset,
        title: a.asset_longname ?? a.asset,
        subtitle: 'Asset · no open market',
        metric: a.supply_normalized != null ? `${formatAmount(a.supply_normalized)} supply` : '—',
        href: `/${encodeURIComponent(a.asset_longname ?? a.asset)}`,
      }))

    const all = [...markets, ...dispensers, ...pools, ...assets]
    const q = query.trim().toUpperCase()
    const scoped = category === 'all' ? all : all.filter((r) => r.category === category)
    // Name relevance first, then venue, then whatever the server said.
    return [...scoped].sort(
      (a, b) =>
        relevance(a, q) - relevance(b, q) ||
        CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category],
    )
  }, [browsing, topMarkets, data, category, query, surface])

  // Which chips to offer at all — a category with nothing in it is a dead
  // control, so the filter row reflects the results rather than a fixed menu.
  const present = useMemo(() => {
    if (!data || browsing) return [] as Category[]
    return (Object.keys(counts) as Category[]).filter((c) => counts[c] > 0)
  }, [data, browsing, counts])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    setCategory('all')
    setPinned(false)
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter' && rows[cursor]) {
      e.preventDefault()
      go(rows[cursor].href)
    }
  }

  return (
    <D.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setCursor(0)
          setPinned(false)
        }
      }}
    >
      <D.Trigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-left text-xs text-zinc-500 transition-colors hover:border-zinc-700 sm:max-w-md"
        >
          <SearchIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search markets…</span>
          <kbd className="hidden shrink-0 rounded border border-zinc-700 px-1 py-px font-sans text-[10px] text-zinc-500 sm:block">
            /
          </kbd>
        </button>
      </D.Trigger>

      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <D.Content className="fixed left-1/2 top-[8vh] z-50 flex max-h-[80vh] w-[min(94vw,38rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60 focus:outline-none">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">
            Find a market, dispenser, pool or asset by name.
          </D.Description>

          <div className="flex items-center gap-2.5 border-b border-zinc-800 px-3.5 py-3">
            <SearchIcon className="size-4 shrink-0 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCursor(0)
                // A new query re-earns the surface default.
                setPinned(false)
              }}
              onKeyDown={onKeyDown}
              placeholder="Search markets, dispensers, pools, assets"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>

          {present.length > 1 && (
            <div className="flex items-center gap-1 border-b border-zinc-800 px-3.5 py-2">
              {(['all', ...present] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c as Category | 'all')
                    setCursor(0)
                    setPinned(true)
                  }}
                  aria-pressed={category === c}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    category === c
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {c === 'all' ? 'All' : CATEGORY_LABEL[c as Category]}
                </button>
              ))}
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {browsing && rows.length > 0 && (
              <li className="px-2.5 py-1 text-[11px] uppercase tracking-wider text-zinc-600">
                Most active · 24h
              </li>
            )}
            {rows.map((row, i) => (
              <li key={row.key}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(row.href)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === cursor ? 'bg-zinc-800' : ''
                  }`}
                >
                  <Image
                    src={`${XCP_IMG_BASE}/icon/${row.icon}`}
                    alt=""
                    width={24}
                    height={24}
                    className="shrink-0 rounded-full"
                    sizes="24px"
                    unoptimized
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-zinc-100">
                      {row.title}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">
                      {row.subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                    {row.metric}
                  </span>
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-zinc-500">
                {isLoading ? 'Searching…' : `Nothing matches “${query.trim()}”`}
              </li>
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-zinc-800 px-3.5 py-2 text-[11px] text-zinc-600">
            <span>{rows.length} result{rows.length === 1 ? '' : 's'}</span>
            <span className="hidden items-center gap-2 sm:flex">
              {/* Says where a pick will land, so staying in place reads as
                  intentional rather than as a link that failed to navigate. */}
              {surface && <span className="text-zinc-500">opens in {surface}</span>}
              <span>↑↓ to move · Enter opens · Esc closes</span>
            </span>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
