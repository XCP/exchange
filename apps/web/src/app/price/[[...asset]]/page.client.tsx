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
import { clusterEvents, type EventCluster } from '@/lib/cluster-events'

/**
 * Price and market cap for the two assets everything else is priced through.
 *
 * Only ever these two: every other asset on the exchange has its own page at
 * /ASSET, priced in its own market. XCP and BTC are the ones with no such
 * market to point at — they ARE the denominators — so their dollar history is
 * the thing worth showing, and it comes from the same daily calendar the
 * charts elsewhere use to convert into USD.
 */
type Coin = 'BTC' | 'XCP' | 'RATIO'

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
const MARKER_COLOR = '#bbf7d0'

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
        Daily closes from the XCP.io price calendar, which also prices every USD figure elsewhere on
        the site. Bitcoin supply is derived from the emission schedule at the current block height
        and counts issued coins, including those provably lost. Third-party venues are listed for
        convenience — no affiliation or endorsement.
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
function PriceChart({
  data,
  coin,
  events,
}: {
  data: { time: Time; value: number }[]
  coin: Coin
  events: typeof PRICE_EVENTS
}) {
  // Two refs: the outer box positions the tooltip, the inner one holds the
  // canvas. The chart sizes itself to its own container, so the tooltip cannot
  // live inside it without becoming part of what is measured.
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ x: number; y: number; cluster: EventCluster } | null>(null)
  /** Live rubber-band while dragging: pixel x of the anchor and the pointer. */
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  /** True once a drag has narrowed the view, so the reset can be offered. */
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (!plotRef.current) return
    const chart = createChart(plotRef.current, {
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#52525b',
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: '#18181b' } },
      crosshair: {
        vertLine: { color: '#3f3f46', width: 1, style: 3, labelBackgroundColor: '#27272a' },
        horzLine: { color: '#3f3f46', width: 1, style: 3, labelBackgroundColor: '#27272a' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderVisible: false, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      handleScale: false,
      handleScroll: false,
    })
    seriesRef.current = chart.addSeries(AreaSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.18)',
      bottomColor: 'rgba(34, 197, 94, 0.01)',
      lineWidth: 2,
      crosshairMarkerRadius: 3,
    })
    chartRef.current = chart

    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width)
      chart.applyOptions({ width: w })
      // Width feeds the clustering threshold, so a resize re-groups the dots.
      setWidth(w)
    })
    ro.observe(plotRef.current)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  // The axis formatter is the only thing the coin changes, so it is applied
  // to the live series rather than rebuilt with it.
  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: {
        type: 'custom',
        minMove: coin === 'RATIO' ? 1 : 0.0001,
        formatter: (v: number) =>
          coin === 'RATIO'
            ? `${Math.round(v).toLocaleString()}`
            : `$${v < 10 ? v.toFixed(4) : v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      },
    })
  }, [coin])

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [data])

  /**
   * Dots for the milestones, grouped so they cannot pile up.
   *
   * Anchored to the series value on the day rather than floating above the
   * line, because a marker above the plot at this density reads as a separate
   * row of noise rather than a point on the history.
   */
  const clusters = useMemo(
    () => clusterEvents(events, dayOfTime(data[0]?.time), dayOfTime(data.at(-1)?.time), width),
    [events, data, width],
  )
  /**
   * Hovering a dot. The markers plugin hit-tests for us and reports which one
   * is under the pointer as `hoveredObjectId`, so there is no distance maths
   * here — the id is the one set when the marker was built.
   *
   * Re-subscribed whenever the clusters change rather than reading them
   * through a ref: a ref written after an earlier effect has read it is the
   * tearing pattern React now rejects, and the handler is cheap to replace.
   */
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const onMove = (param: MouseEventParams<Time>) => {
      const id = param.hoveredObjectId
      if (typeof id !== 'string' || !param.point) return setHover(null)
      const cluster = clusters.find((c) => c.id === id)
      setHover(cluster ? { x: param.point.x, y: param.point.y, cluster } : null)
    }
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [clusters])

  useEffect(() => {
    if (!seriesRef.current) return
    const byDay = new Map(data.map((d) => [dayOfTime(d.time), d.value]))
    const markers: SeriesMarker<Time>[] = clusters.flatMap((c) => {
      const price = byDay.get(c.day)
      // No plotted value on that exact day means no line to pin to, so the
      // marker is dropped rather than falling back to a bar position that
      // would sit somewhere arbitrary.
      if (price == null) return []
      return [{
      id: c.id,
      time: (Date.parse(`${c.day}T00:00:00Z`) / 1000) as Time,
      /**
       * Pinned to the series value, not to the bar. 'inBar' ignores `price`
       * and centres on the bar's own geometry, which on an area series left
       * the dots floating near the line rather than on it — the thing that
       * made them read as unrelated to the chart they annotate.
       */
      position: 'atPriceMiddle',
      shape: 'circle',
      /**
       * One size and one colour for every dot.
       *
       * Sizing by cluster made the count look like significance — a group of
       * two small listings drew a bigger dot than the all-time high. How many
       * events sit under a dot is a detail for the tooltip, not a visual
       * weight. The colour is a light tint of the line's own green rather
       * than white or grey: white floated above the plot as a separate layer
       * and grey sank into the background, while a tint of the series colour
       * reads as a point ON this line.
       */
      color: MARKER_COLOR,
      size: 1,
      price,
      }]
    })
    if (!markersRef.current) markersRef.current = createSeriesMarkers(seriesRef.current, markers)
    else markersRef.current.setMarkers(markers)
  }, [clusters, data])

  /**
   * Drag across the plot to zoom into that span.
   *
   * The library pans and scales but has no rubber-band selection, so this is
   * ours: anchor on mousedown, draw a band, and on release convert the two
   * pixel positions into times and hand them to setVisibleRange. Scrolling and
   * scaling stay disabled — a chart that moves when you brush past it is worse
   * than one that only moves when asked.
   */
  const plotX = (e: React.MouseEvent) => {
    const box = plotRef.current?.getBoundingClientRect()
    return box ? e.clientX - box.left : 0
  }

  const endDrag = (e: React.MouseEvent) => {
    const d = drag
    setDrag(null)
    if (!d) return
    const to = plotX(e)
    const [lo, hi] = [Math.min(d.from, to), Math.max(d.from, to)]
    // A click is not a selection. Below this it was almost certainly a stray
    // press, and zooming to a 3px window would empty the chart.
    if (hi - lo < 12) return
    const scale = chartRef.current?.timeScale()
    const from = scale?.coordinateToTime(lo)
    const until = scale?.coordinateToTime(hi)
    if (from == null || until == null) return
    scale?.setVisibleRange({ from, to: until })
    setZoomed(true)
  }

  const resetZoom = () => {
    chartRef.current?.timeScale().fitContent()
    setZoomed(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {zoomed && (
        <button
          type="button"
          onClick={resetZoom}
          className="absolute right-2 top-2 z-30 rounded-sm border border-zinc-700 bg-zinc-900/90 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
          Reset zoom
        </button>
      )}
      {drag && Math.abs(drag.to - drag.from) > 2 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-10 bg-zinc-100/10"
          style={{
            left: Math.min(drag.from, drag.to),
            width: Math.abs(drag.to - drag.from),
          }}
        />
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[16rem] rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 shadow-lg"
          // Nudged up and clamped to the left edge so a dot near the right
          // side does not push the box out of the plot.
          style={{
            left: Math.min(hover.x + 10, Math.max(0, width - 260)),
            top: Math.max(0, hover.y - 12),
          }}
        >
          {hover.cluster.events.map((e) => (
            <div key={e.day} className="text-[11px] leading-snug text-zinc-200">
              {e.label}
              <span className="ml-1.5 text-zinc-500">{e.day}</span>
            </div>
          ))}
        </div>
      )}
      <div
        ref={plotRef}
        className="w-full cursor-crosshair"
        onMouseDown={(e) => setDrag({ from: plotX(e), to: plotX(e) })}
        onMouseMove={(e) => drag && setDrag({ ...drag, to: plotX(e) })}
        onMouseUp={endDrag}
        // Releasing outside the plot should cancel rather than zoom to an
        // edge the pointer never actually reached.
        onMouseLeave={() => setDrag(null)}
      />
    </div>
  )
}

/** A series time back to the YYYY-MM-DD the events are keyed on. */
function dayOfTime(t: Time | undefined): string | undefined {
  return typeof t === 'number' ? new Date(t * 1000).toISOString().slice(0, 10) : undefined
}
