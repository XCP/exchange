'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  AreaSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import { Tabs, SegmentedList, SegmentedTrigger } from '@/components/ui/tabs'
import { usePriceHistory, bitcoinSupply } from '@/lib/hooks/usePriceHistory'
import { useBlockHeight } from '@/lib/hooks/useNetworkInfo'
import { formatBig, formatPct, pctColor } from '@/utils/format-analytics'
import { XCP_IMG_BASE } from '@/utils/constants'
import { replacePairPath } from '@/lib/trade-routes'
import { PRICE_EVENTS, type PriceEvent } from '@/lib/price-events'
import { PriceChart, MARKER_COLOR, type Coin } from '@/components/price-chart'

/**
 * Price and market cap for the two assets everything else is priced through.
 *
 * Only ever these two: every other asset on the exchange has its own page at
 * /ASSET, priced in its own market. XCP and BTC are the ones with no such
 * market to point at — they ARE the denominators — so their dollar history is
 * the thing worth showing, and it comes from the same daily calendar the
 * charts elsewhere use to convert into USD.
 */

/**
 * The ratio tab is XCP priced in BITCOIN, shown in satoshis.
 *
 * It is the one number a Counterparty holder actually lives in — every market
 * on the exchange settles against XCP or BTC, so how the two move against
 * each other is the exchange rate underneath everything else. In BTC it reads
 * 0.00002439, which no one can compare at a glance; in sats it reads 2,439.
 */
const SATS_PER_BTC = 1e8

/**
 * The milestone dot colour, shared by the chart markers and the sample dot on
 * the Annotations button. One constant so the button cannot advertise a colour
 * the chart no longer draws — the dot only hints at what the toggle does if it
 * is literally the same dot.
 */

/**
 * `deep` marks the windows that need more than the shallow payload. 1M and 1Y
 * fit inside the 400-day calendar every other chart on the site already
 * fetches, so the common case costs no extra request at all.
 */
const WINDOWS = [
  { label: '1M', days: 30, deep: false },
  { label: '1Y', days: 365, deep: false },
  { label: '5Y', days: 1825, deep: true },
  { label: 'All', days: Infinity, deep: true },
] as const

/**
 * Where to actually get some — onboarding, not a trading surface.
 *
 * Someone reading a price page mostly has one question, and for these two
 * coins the honest answer is usually somewhere else: you cannot buy bitcoin
 * on a Counterparty DEX, and XCP's deepest venues include exchanges we do not
 * run. Linking out is more useful than pretending otherwise.
 *
 * Only Dispensers is ours. The rest are third parties listed as a convenience
 * — no affiliation, and nothing about you travels with the click.
 *
 * The two XCP venues link straight to their XCP market. The bitcoin ones stay
 * on their roots — those are swap widgets whose pair is chosen on the page,
 * and a guessed path that 404s is worse than one more click.
 */
interface Venue {
  label: string
  href: string
  hint: string
  external?: boolean
}
const ACTIONS: Record<'BTC' | 'XCP', Venue[]> = {
  BTC: [
    { label: 'ChangeNow', href: 'https://changenow.io', hint: 'Card or crypto, no account', external: true },
    { label: 'SimpleSwap', href: 'https://simpleswap.io', hint: 'Crypto swap, no signup', external: true },
    { label: 'SideShift', href: 'https://sideshift.ai', hint: 'Crypto swap, no signup', external: true },
  ],
  XCP: [
    { label: 'Dispensers', href: '/buy/XCP', hint: 'On-chain here, paid in BTC' },
    { label: 'Dex-Trade', href: 'https://dex-trade.com/spot/trading/XCPBTC', hint: 'Centralized, XCP/BTC', external: true },
    { label: 'Zaif.jp', href: 'https://zaif.jp/token_chart/xcp_jpy', hint: 'Japanese exchange, JPY', external: true },
  ],
}

export default function PriceClient({ initial }: { initial: Coin }) {
  const [coin, setCoin] = useState<Coin>(initial)
  const [window_, setWindow] = useState<(typeof WINDOWS)[number]['label']>('1M')
  /**
   * Milestone dots, off until asked for.
   *
   * Unexplained marks on a price line read as a defect — the first question is
   * "what are these?" rather than "what happened here?". Behind a button they
   * arrive already answered, which also means their styling has to carry much
   * less: a dot you switched on does not need to justify itself.
   *
   * Desktop only. The tooltip is a hover affordance with no touch equivalent,
   * and at phone width twelve years of history is too few pixels per year for
   * the dots to separate at all.
   */
  const [annotations, setAnnotations] = useState(false)
  const height = useBlockHeight()

  const spec = WINDOWS.find((w) => w.label === window_) ?? WINDOWS[0]
  const { rows, stats, isLoading } = usePriceHistory(spec.deep)
  const series = useMemo(() => {
    const sliced = spec.days === Infinity ? rows : rows.slice(-spec.days)
    return sliced.map((r) => ({
      time: Math.floor(Date.parse(`${r.day}T00:00:00Z`) / 1000) as Time,
      value: valueOf(r, coin),
    }))
  }, [rows, spec.days, coin])

  const latest = rows.at(-1)
  const price = latest ? valueOf(latest, coin) : null

  // Supply comes from the calendar for XCP and from the emission schedule for
  // BTC — neither needs a request beyond what the page already makes.
  // Memoised only because it loops the halving epochs; the cost is trivial but
  // it has no reason to run on every render.
  const btcSupply = useMemo(() => (height ? bitcoinSupply(height) : null), [height])
  // From the server stats, which see the whole calendar — `latest` is only the
  // last row of the WINDOW, and a shallow window still has today in it, but
  // reading supply from the authoritative figure keeps the two in step.
  const xcpSupply = stats?.supply ?? latest?.supply ?? null
  const supply = coin === 'BTC' ? btcSupply : coin === 'XCP' ? xcpSupply : null
  const marketCap =
    coin === 'RATIO' || price == null || supply == null ? null : price * supply

  /**
   * How the two market caps compare, for the ratio tab.
   *
   * Current only, and deliberately not charted: a historical series would need
   * bitcoin's supply on every past day, which means a block height per day
   * that this calendar does not carry. Deriving today's from the current tip
   * is exact; back-filling it would be a guess drawn as a line.
   */
  const capRatio =
    latest && btcSupply && xcpSupply
      ? (latest.xcp * xcpSupply) / (latest.btc * btcSupply)
      : null
  /** How many XCP one bitcoin buys, which is the ratio the other way up. */
  const xcpPerBtc = latest && latest.xcp > 0 ? latest.btc / latest.xcp : null

  /**
   * Change across the window ON SCREEN, so the figure always answers the
   * chart beside it: first plotted close to last plotted close. Switching the
   * window changes the number because it changes the question.
   *
   * Both ends are shown rather than just the percentage — a bare "−58.2% 1Y"
   * cannot tell you whether it means the last 365 days, the calendar year, or
   * something else, and the two prices say it without ambiguity.
   */
  const first = series[0]?.value
  const change = first && price != null && first > 0 ? ((price - first) / first) * 100 : null

  /**
   * Highest daily close on record — from the server, which sees the whole
   * calendar. Deriving it here would mean downloading twelve years to draw
   * one, and computing it from a window would quietly turn "all-time high"
   * into "highest lately", which is a wrong number rather than a slow one.
   *
   * A daily close, not an intraday high: the calendar has one price per day,
   * so a wick that closed lower is not in the data.
   */
  const ath = coin === 'BTC' ? stats?.ath.btc : coin === 'XCP' ? stats?.ath.xcp : stats?.ath.ratio

  /**
   * What this tab annotates.
   *
   * The all-time high is DERIVED from the same server stat the figure below
   * the chart shows, not written into the hardcoded list — a pinned date would
   * quietly become wrong the day a new high is set, and a chart whose marker
   * disagrees with its own caption is worse than one with no marker.
   *
   * It is also the only annotation bitcoin gets. The Counterparty milestones
   * have nothing to do with BTC's price, but its own peak is a fact about the
   * line being drawn.
   */
  const chartEvents = useMemo<PriceEvent[]>(() => {
    const peak: PriceEvent[] = ath
      ? [{
          day: ath.day,
          label: `${coin === 'RATIO' ? 'XCP/BTC' : coin} all-time high`,
          note: `Highest daily close, ${show(ath.value, coin)}`,
          solo: true,
        }]
      : []
    return coin === 'BTC' ? peak : [...PRICE_EVENTS, ...peak]
  }, [ath, coin])

  const select = (next: Coin) => {
    setCoin(next)
    /**
     * Ratio has no segment of its own — it is what /price means. The two
     * coins get a spelling because someone linking to "the XCP price" wants
     * to land on it, whereas the ratio is the page's own subject and a
     * /price/RATIO would be a second name for the same thing.
     *
     * Rewritten rather than navigated so the chosen window survives.
     */
    replacePairPath(next === 'RATIO' ? '/price' : `/price/${next}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Tabs value={coin} onValueChange={(v) => select(v as Coin)}>
          <SegmentedList className="w-64">
            <SegmentedTrigger value="BTC">BTC</SegmentedTrigger>
            <SegmentedTrigger value="XCP">XCP</SegmentedTrigger>
            <SegmentedTrigger value="RATIO">Ratio</SegmentedTrigger>
          </SegmentedList>
        </Tabs>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              onClick={() => setWindow(w.label)}
              className={`rounded-sm px-2 py-1 text-[11px] transition-colors ${
                window_ === w.label
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {coin === 'RATIO' ? (
            <span className="flex items-center -space-x-2">
              <Image src={`${XCP_IMG_BASE}/icon/XCP`} alt="" width={28} height={28} className="rounded-full ring-2 ring-zinc-900" unoptimized />
              <Image src={`${XCP_IMG_BASE}/icon/BTC`} alt="" width={28} height={28} className="rounded-full ring-2 ring-zinc-900" unoptimized />
            </span>
          ) : (
            <Image src={`${XCP_IMG_BASE}/icon/${coin}`} alt="" width={28} height={28} className="rounded-full" unoptimized />
          )}
          <span className="font-mono text-3xl tabular-nums text-zinc-100">
            {price != null ? show(price, coin) : '—'}
          </span>
          {change != null && (
            <span className={`font-mono text-sm ${pctColor(change)}`}>
              {formatPct(change)} <span className="text-zinc-600">{spec.label}</span>
            </span>
          )}
          </div>
          {chartEvents.length > 0 && (
            <button
              type="button"
              onClick={() => setAnnotations((v) => !v)}
              aria-pressed={annotations}
              className={`hidden shrink-0 rounded-sm border px-2 py-1 text-[11px] transition-colors md:inline-flex ${
                annotations
                  ? 'border-green-500/40 bg-green-500/10 text-green-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {/* A sample of the thing being switched on, so the control
                  shows its own effect rather than naming it. */}
              <span
                aria-hidden
                className="mr-1.5 inline-flex size-1.5 shrink-0 self-center rounded-full transition-colors"
                style={{ backgroundColor: annotations ? MARKER_COLOR : '#a1a1aa' }}
              />
              Annotations
            </button>
          )}
        </div>
        {change != null && first != null && price != null && (
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            {show(first, coin)} <span className="text-zinc-600">{series[0] && dayOf(rows, series.length)}</span>
            {' → '}
            {show(price, coin)} <span className="text-zinc-600">{rows.at(-1)?.day}</span>
          </p>
        )}

        <div className="mt-4">
          {/* Counterparty milestones belong to XCP, not to bitcoin — the
              ratio counts because it is XCP measured in BTC. */}
          <PriceChart data={series} coin={coin} events={annotations ? chartEvents : []} />
          {isLoading && series.length === 0 && (
            <p className="py-16 text-center text-xs text-zinc-500">Loading price history…</p>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-zinc-800 pt-4 text-xs sm:grid-cols-3">
          {coin === 'RATIO' ? (
            <>
              <Stat label="Market cap ratio">
                {capRatio != null ? `${(capRatio * 100).toFixed(5)}% of BTC` : '—'}
              </Stat>
              <Stat label="1 BTC buys">
                {xcpPerBtc != null ? `${formatBig(xcpPerBtc)} XCP` : '—'}
              </Stat>
            </>
          ) : (
            <>
              <Stat label="Market cap">
                {marketCap != null ? `$${formatBig(marketCap)}` : '—'}
              </Stat>
              <Stat label="Circulating supply">
                {supply != null ? `${formatBig(supply)} ${coin}` : '—'}
              </Stat>
            </>
          )}
          {ath && (
            <Stat label="All-time high">
              {show(ath.value, coin)} <span className="text-zinc-600">{ath.day}</span>
            </Stat>
          )}
        </dl>
      </div>

      {/* The ratio is about both coins, so it offers both ways in. */}
      {(coin === 'RATIO' ? (['BTC', 'XCP'] as const) : ([coin] as const)).map((c) => (
      <section key={c}>
      <h2 className="mt-6 text-sm uppercase tracking-wider text-zinc-400">Buy {c}</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {ACTIONS[c].map((a) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
                {a.label}
                {a.external && (
                  <svg viewBox="0 0 24 24" aria-hidden className="size-3 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17 17 7M9 7h8v8" />
                  </svg>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">{a.hint}</span>
            </>
          )
          const className =
            'rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-colors hover:border-zinc-700'
          return a.external ? (
            <a key={a.href} href={a.href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
              {body}
            </a>
          ) : (
            <Link key={a.href} href={a.href} className={className}>
              {body}
            </Link>
          )
        })}
      </div>
      </section>
      ))}

      {/*
        Where every dot came from, revealed with the dots themselves.

        A marked-up chart makes a claim about history, and a claim without a
        provenance is just an assertion. Kept behind the same toggle because it
        is the annotations' own footnote — showing it while the chart is bare
        would be a citation list for nothing.
      */}
      {annotations && chartEvents.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-400">Sources</h2>
          <dl className="mt-2 divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {[...chartEvents].sort((a, b) => a.day.localeCompare(b.day)).map((e) => (
              <div key={e.day} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
                <dt className="w-24 shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                  {e.day}
                </dt>
                <dd className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="text-zinc-200">{e.label}</span>
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="min-w-0 truncate text-[11px] text-zinc-400 transition-colors hover:text-zinc-100"
                    >
                      {e.note}
                    </a>
                  ) : (
                    // No published source for this one — the note still says
                    // how the date was established, it just cannot be clicked.
                    <span className="min-w-0 truncate text-[11px] text-zinc-500">{e.note}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
        Completed days use the XCP.io daily price calendar; today&apos;s XCP endpoint uses the current
        dispenser ask. Bitcoin supply is derived from the emission schedule at the current block
        height and counts issued coins, including those provably lost. Third-party venues are listed
        for convenience — no affiliation or endorsement.
      </p>
    </div>
  )
}

/** The plotted value for a row: dollars for a coin, satoshis for the ratio. */
function valueOf(r: { xcp: number; btc: number }, coin: Coin): number {
  if (coin === 'BTC') return r.btc
  if (coin === 'XCP') return r.xcp
  return r.btc > 0 ? (r.xcp / r.btc) * SATS_PER_BTC : 0
}

/** Dollars at a sensible precision for either coin's magnitude. */
function usd(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 4 : 2 })}`
}

/** Headline formatting — the ratio is satoshis, the coins are dollars. */
function show(v: number, coin: Coin): string {
  return coin === 'RATIO' ? `${Math.round(v).toLocaleString()} sats` : usd(v)
}

/** The day the visible window starts on. */
function dayOf(rows: { day: string }[], windowLength: number): string {
  return rows[Math.max(0, rows.length - windowLength)]?.day ?? ''
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-mono tabular-nums text-zinc-200">{children}</dd>
    </div>
  )
}

/**
 * A plain area chart — same visual grammar as the pool charts.
 *
 * Built ONCE and fed afterwards. Both `data` and `coin` change on every window
 * click, and having them in the effect's dependencies tore the whole chart
 * down and rebuilt it each time — a new canvas, a new ResizeObserver and a
 * fresh fitContent for what is really just a different set of points.
 */
