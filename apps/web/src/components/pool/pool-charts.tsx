'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  AreaSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type Time,
} from 'lightweight-charts'
import {
  CHART_TIMEFRAMES,
  TIMEFRAME_SPEC,
  useTradeSeries,
  type ChartTimeframe,
} from '@/lib/hooks/useTradeSeries'
import { usePoolLiquidity } from '@/lib/hooks/usePoolLiquidity'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { num } from '@/utils/numeric'
import { buildDepthCurve, spotPrice } from '@/lib/pool-depth'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'

const TABS = ['Price', 'Volume', 'Liquidity', 'Depth'] as const
type PoolTab = (typeof TABS)[number]

/**
 * The four views of a pool, as tabs over one chart area.
 *
 * Three of them are time series and share a timeframe; Depth is not. Depth's
 * x-axis is PRICE — it answers "how far would size move this pool", a
 * question with no time in it — so it is drawn as plain SVG rather than bent
 * to fit a time-series library, and the timeframe pills hide while it's open
 * because they would control nothing.
 *
 * Price and Volume come from the same candles, so switching between them
 * costs no request. Liquidity has its own endpoint because reserves are a
 * level rather than a flow and can't be derived from trade candles.
 */
export function PoolCharts({
  pairSlug,
  lpAsset,
  baseAsset,
  quoteAsset,
  reserveBase,
  reserveQuote,
  feeBps,
}: {
  pairSlug: string | null
  lpAsset: string
  baseAsset: string
  quoteAsset: string
  reserveBase: number
  reserveQuote: number
  /** 50 when either leg is XCP, 100 otherwise — see pool-depth.ts. */
  feeBps: number
}) {
  const [tab, setTab] = useState<PoolTab>('Price')
  /**
   * What the pointer is currently over. A crosshair with no readout makes you
   * estimate against the axis; this reports the exact figure under it, and
   * falls back to the latest value the moment the pointer leaves.
   */
  const [hover, setHover] = useState<{ time: number; value: number } | null>(null)
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('1M')
  const isDepth = tab === 'Depth'

  const { candles, last, change, realCount } = useTradeSeries({
    venue: 'market',
    pairSlug,
    asset: null,
    timeframe,
  })
  const { interval, limit } = TIMEFRAME_SPEC[timeframe]
  const { points: liquidity } = usePoolLiquidity(tab === 'Liquidity' ? lpAsset : null, interval, limit)
  // Only fetched while Depth is open — the other three tabs have no use for it.
  const { bids, asks } = useOrderBook(isDepth && baseAsset && quoteAsset ? `${baseAsset}/${quoteAsset}` : '')

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  /** What the current tab plots, as {time, value} for the shared chart. */
  const series = useMemo(() => {
    if (tab === 'Price') return candles.map((c) => ({ time: c.t as Time, value: c.c }))
    if (tab === 'Volume') return candles.map((c) => ({ time: c.t as Time, value: c.v }))
    if (tab === 'Liquidity') {
      // Both sides of a constant-product pool are equal in value at the pool's
      // own price, so total value locked is twice the quote reserve.
      return liquidity.map((p) => ({ time: p.t as Time, value: p.b * 2 }))
    }
    return []
  }, [tab, candles, liquidity])

  // Rebuilt per tab rather than mutated: Volume is a histogram and the other
  // two are areas, and swapping a series type in place is more code than
  // making a new chart on a click the visitor asked for.
  useEffect(() => {
    if (isDepth || !containerRef.current) return
    const chart = createChart(containerRef.current, {
      height: 260,
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
      timeScale: { borderVisible: false, timeVisible: true, fixLeftEdge: true, fixRightEdge: true },
      handleScale: false,
      handleScroll: false,
    })
    const opts = {
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'custom' as const, minMove: 0.00000001, formatter: (v: number) => formatPrice(v) },
    }
    const s =
      tab === 'Volume'
        ? chart.addSeries(HistogramSeries, { ...opts, color: 'rgba(34, 197, 94, 0.5)' })
        : chart.addSeries(AreaSeries, {
            ...opts,
            lineColor: '#22c55e',
            topColor: 'rgba(34, 197, 94, 0.18)',
            bottomColor: 'rgba(34, 197, 94, 0.01)',
            lineWidth: 2,
            crosshairMarkerRadius: 3,
          })
    s.setData(series)
    chart.timeScale().fitContent()
    chartRef.current = chart

    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData.get(s) as { value?: number } | undefined
      // `param.time` is unset once the pointer leaves the plot area.
      if (!param.time || point?.value == null) return setHover(null)
      setHover({ time: param.time as number, value: point.value })
    })

    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: Math.floor(e.contentRect.width) }))
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [tab, series, isDepth])

  // The book arrives as formatted decimal strings; the curve needs numbers.
  const book = useMemo(
    () => ({
      bids: (bids ?? []).map((o) => ({ price: num(o.price), amount: num(o.amount) })),
      asks: (asks ?? []).map((o) => ({ price: num(o.price), amount: num(o.amount) })),
    }),
    [bids, asks],
  )
  const depth = useMemo(
    () => (isDepth ? buildDepthCurve(reserveBase, reserveQuote, feeBps, book) : []),
    [isDepth, reserveBase, reserveQuote, feeBps, book],
  )
  const spot = spotPrice(reserveBase, reserveQuote)

  /** The bucket under the pointer, dated. Blank when not hovering. */
  const hoverDate = hover
    ? new Date(hover.time * 1000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        // The intraday timeframes bucket by hour, so a bare date would
        // repeat itself down the axis.
        ...(timeframe === '1D' || timeframe === '1W' ? { hour: 'numeric' } : {}),
      })
    : null

  const headline = () => {
    if (isDepth) {
      return (
        <>
          <span className="text-xl font-light text-zinc-100">
            1 {baseAsset} = {formatPrice(spot)} {quoteAsset}
          </span>
          <span className="ml-2 text-xs text-zinc-500">pool price</span>
        </>
      )
    }
    if (tab === 'Liquidity') {
      const tvl = hover ? hover.value : series.length ? series[series.length - 1].value : 0
      return (
        <>
          <span className="text-xl font-light text-zinc-100">{formatAmount(tvl)} {quoteAsset}</span>
          <span className="ml-2 text-xs text-zinc-500">{hoverDate ?? 'total value locked'}</span>
        </>
      )
    }
    if (tab === 'Volume') {
      // Hovering asks about one bucket; not hovering asks about the window.
      const total = series.reduce((sum, p) => sum + p.value, 0)
      return (
        <>
          <span className="text-xl font-light text-zinc-100">
            {formatAmount(hover ? hover.value : total)} {baseAsset}
          </span>
          <span className="ml-2 text-xs text-zinc-500">
            {hoverDate ? `traded · ${hoverDate}` : `traded · ${timeframe}`}
          </span>
        </>
      )
    }
    const up = (change ?? 0) >= 0
    const shown = hover ? hover.value : last
    return (
      <>
        <span className="text-xl font-light text-zinc-100">
          1 {baseAsset} = {shown != null ? formatPrice(shown) : '—'} {quoteAsset}
        </span>
        {hoverDate ? (
          <span className="ml-2 text-xs text-zinc-500">{hoverDate}</span>
        ) : (
          change != null &&
          realCount > 0 && (
            <span className={`ml-2 text-xs tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
            </span>
          )
        )}
      </>
    )
  }

  return (
    <section className="rounded-sm border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center gap-4 border-b border-zinc-800 px-4">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              // A readout from the previous tab would be a stale number.
              setHover(null)
            }}
            className={`border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              t === tab
                ? 'border-green-500 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">{headline()}</div>

      <div className="px-2 pb-2 pt-3">
        {isDepth ? (
          <DepthChart points={depth} spot={spot} baseAsset={baseAsset} />
        ) : (
          <div ref={containerRef} />
        )}
      </div>

      {/* Hidden on Depth: it has no time axis for them to act on. */}
      {!isDepth && (
        <div className="flex justify-end gap-1 border-t border-zinc-800 px-4 py-2">
          {CHART_TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTimeframe(t)
                setHover(null)
              }}
              className={`rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors ${
                t === timeframe ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * The depth curve, in plain SVG.
 *
 * Cumulative size on the y-axis against price on the x — the same shape an
 * order book's depth chart draws, so the two read the same way even though
 * this one is computed from a formula rather than summed from resting orders.
 * Green is the buy side, red the sell side, split at the pool's price.
 */
function DepthChart({
  points,
  spot,
  baseAsset,
}: {
  points: ReturnType<typeof buildDepthCurve>
  spot: number
  baseAsset: string
}) {
  // Declared before any early return: hooks must run in the same order on
  // every render, and this component bails out when the pool is empty.
  const [at, setAt] = useState<{ price: number; size: number; side: 'buy' | 'sell' } | null>(null)

  if (points.length === 0) {
    return <div className="flex h-[260px] items-center justify-center text-xs text-zinc-600">No liquidity in this pool.</div>
  }

  const W = 100
  const H = 100
  const maxSize = Math.max(...points.map((p) => p.size))
  const minPrice = points[0].price
  const maxPrice = points[points.length - 1].price
  const x = (price: number) => ((price - minPrice) / (maxPrice - minPrice)) * W
  const y = (size: number) => H - (size / maxSize) * H

  const path = (side: 'buy' | 'sell') => {
    const side_ = points.filter((p) => p.side === side)
    if (!side_.length) return ''
    const pts = side_.map((p) => `${x(p.price).toFixed(2)},${y(p.size).toFixed(2)}`).join(' L')
    const first = side_[0]
    const lastPt = side_[side_.length - 1]
    return `M${x(first.price).toFixed(2)},${H} L${pts} L${x(lastPt.price).toFixed(2)},${H} Z`
  }

  return (
    <div className="px-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[260px] w-full"
        onMouseLeave={() => setAt(null)}
        onMouseMove={(e) => {
          // The viewBox is stretched to the element, so read the pointer as a
          // fraction of the box rather than in viewBox units.
          const r = e.currentTarget.getBoundingClientRect()
          const frac = (e.clientX - r.left) / r.width
          const price = minPrice + frac * (maxPrice - minPrice)
          // Nearest computed point — the curve is sampled, not continuous.
          let best = points[0]
          for (const p of points) {
            if (Math.abs(p.price - price) < Math.abs(best.price - price)) best = p
          }
          setAt(best)
        }}
      >
        <path d={path('sell')} fill="rgba(248, 113, 113, 0.15)" stroke="#f87171" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        <path d={path('buy')} fill="rgba(34, 197, 94, 0.15)" stroke="#22c55e" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        <line x1={x(spot)} y1="0" x2={x(spot)} y2={H} stroke="#71717a" strokeWidth="0.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        {at && (
          <line
            x1={x(at.price)}
            y1="0"
            x2={x(at.price)}
            y2={H}
            stroke={at.side === 'buy' ? '#22c55e' : '#f87171'}
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-2 flex justify-between px-1 font-mono text-[10px] text-zinc-600">
        <span>{formatPrice(minPrice)}</span>
        <span className="text-zinc-500">
          {at ? (
            <>
              <span className={at.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                {at.side === 'buy' ? 'buy' : 'sell'} {formatAmount(at.size)} {baseAsset}
              </span>
              {' '}to move price to {formatPrice(at.price)}
            </>
          ) : (
            <>up to {formatAmount(maxSize)} {baseAsset} to move ±50%</>
          )}
        </span>
        <span>{formatPrice(maxPrice)}</span>
      </div>
    </div>
  )
}
