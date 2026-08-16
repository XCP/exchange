'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type Time,
} from 'lightweight-charts'
import {
  CHART_TIMEFRAMES,
  useTradeSeries,
  type ChartTimeframe,
  type ChartVenue,
} from '@/lib/hooks/useTradeSeries'
import { formatPrice } from '@/utils/format-price'
import { formatCommas } from '@/utils/format-commas'
import { useSatsMode } from '@/lib/sats-context'
import { useUsdAnchors } from '@/lib/hooks/useUsdAnchors'
import { big, num, DIVISIBLE_DECIMALS } from '@/utils/numeric'

/**
 * The price panel that opens beside a trading form.
 *
 * An area chart rather than candles: at this size a candle body is a few
 * pixels wide and its wicks are noise, and the question someone asks before
 * pressing Swap is "which way has this been going", not "what was Tuesday's
 * high". The full-page chart on /trade keeps candles for the people who do
 * want that.
 *
 * The venue is named under the chart rather than assumed. A DEX pair is
 * priced in its quote asset and already blends the order book with the pool;
 * a dispenser series is priced in bitcoin. Those are different numbers about
 * the same asset, and a chart that didn't say which would be the most
 * misleading thing on the page.
 */
export function TradeChart({
  venue,
  pairSlug,
  asset,
  title,
  quoteLabel,
  timeframe,
  onTimeframeChange,
  height = 180,
  headerRight,
}: {
  venue: ChartVenue
  pairSlug: string | null
  asset: string | null
  /** What is being charted, e.g. "XCP / PEPECASH" or "XCP". */
  title: string
  /** The unit prices are in — the quote asset, or BTC for dispensers. */
  quoteLabel: string
  timeframe: ChartTimeframe
  onTimeframeChange: (t: ChartTimeframe) => void
  /** Plot height. Taller where the chart sits beside a full trade form. */
  height?: number
  /** Top-right slot — a pair picker where the asset has several markets. */
  headerRight?: ReactNode
}) {
  const { candles, realCount, last, change, isLoading } = useTradeSeries({
    venue,
    pairSlug,
    asset,
    timeframe,
  })

  /**
   * The nav's BTC/sats switch drives this too, but only where prices are
   * actually in bitcoin — the dispenser series, and any BTC-quoted market.
   * An XCP-quoted pair has no sats to express, so the toggle leaves it alone.
   *
   * The DATA is scaled, not just the header: formatting the label in sats
   * while the axis stayed in BTC would put two different units on one chart.
   */
  const { satsMode } = useSatsMode()

  /**
   * Dollars are reachable for a series quoted in XCP or BTC, because those are
   * the two assets we hold a daily USD calendar for. Anything quoted in a
   * third asset has no route to USD this component can vouch for, so it simply
   * offers no toggle.
   */
  const usdUnit: 'xcp' | 'btc' | null =
    quoteLabel === 'XCP' ? 'xcp' : quoteLabel === 'BTC' ? 'btc' : null
  const [showUsd, setShowUsd] = useState(false)
  const { rateFor, ready: anchorsReady } = useUsdAnchors()
  const inUsd = showUsd && usdUnit !== null && anchorsReady
  // USD wins over sats: both are re-denominations and stacking them is
  // meaningless.
  const inSats = !inUsd && quoteLabel === 'BTC' && satsMode
  const unit = inUsd ? 'USD' : inSats ? 'sats' : quoteLabel
  // shiftedBy, not `* 1e8` — a decimal-point move rather than a float multiply.
  const scale = (v: number) => (inSats ? num(big(v).shiftedBy(DIVISIBLE_DECIMALS)) : v)

  /**
   * Priced at the rate that applied WHEN the candle happened, which is why
   * this takes a timestamp. Multiplying the whole series by today's rate would
   * leave the shape intact and every dollar figure wrong but the last.
   */
  const convert = (value: number, t: number) => {
    if (!inUsd || !usdUnit) return scale(value)
    const rate = rateFor(t, usdUnit)
    return rate ? value * rate : value
  }

  /**
   * A satoshi is the indivisible unit, so it never carries decimals: 3,500,
   * not 3500.00000000. The axis formatter receives values that have ALREADY
   * been scaled into sats, which is why it can't just call formatPrice with
   * the sats flag the way the header does.
   */
  const inSatsRef = useRef(inSats)
  inSatsRef.current = inSats
  const usdRef = useRef(inUsd)
  usdRef.current = inUsd
  const axisLabel = (v: number) =>
    usdRef.current
      ? `$${v < 1 ? v.toPrecision(3) : v.toFixed(2)}`
      : inSatsRef.current
        ? formatCommas(Math.round(v).toString())
        : formatPrice(v)

  // The build effect runs once; later height changes are applied separately
  // below. Reading through a ref keeps it genuinely dependency-free rather
  // than silencing the lint rule about it.
  const initialHeight = useRef(height)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  // Build once. Re-creating the chart on every data change would drop the
  // crosshair and re-run the fit animation on each poll.
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      height: initialHeight.current,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#52525b',
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: 10,
        // At 180px the library's watermark sits on top of the series itself.
        // The full-page chart keeps it; there it has room to sit in a corner.
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
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.18)',
      bottomColor: 'rgba(34, 197, 94, 0.01)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderColor: '#22c55e',
      crosshairMarkerBackgroundColor: '#09090b',
      priceFormat: { type: 'custom', minMove: 0.00000001, formatter: axisLabel },
    })
    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.floor(entry.contentRect.width) })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.applyOptions({ height })
  }, [height])

  useEffect(() => {
    // Whole-number ticks in sats: with a 1e-8 minMove the scale would happily
    // label a gridline 3,500.25, and a quarter of a satoshi does not exist.
    seriesRef.current?.applyOptions({
      priceFormat: {
        type: 'custom',
        minMove: inUsd ? 0.0001 : inSats ? 1 : 0.00000001,
        formatter: axisLabel,
      },
    })
    // `axisLabel` is deliberately not a dependency: it is rebuilt every render
    // but reads the unit from a ref, so it never goes stale and adding it here
    // would re-apply the options on every render for nothing.
  }, [inSats, inUsd])

  useEffect(() => {
    if (!seriesRef.current) return
    const data: AreaData<Time>[] = candles.map((c) => ({ time: c.t as Time, value: convert(c.c, c.t) }))
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
    // `inSats` is a dependency: flipping the nav switch has to redraw the
    // series, not just relabel it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, inSats, inUsd])

  const up = (change ?? 0) >= 0
  /**
   * A line needs three points to describe a trend; with one or two it invents
   * one. Measured against production, 37% of even the top 500 markets by
   * volume have fewer than three trades EVER — one sale connected to another
   * by a straight line reads as a move that never happened.
   *
   * Below the bar the honest artefact is the last sale itself, not a chart.
   */
  const MIN_REAL = 3
  const thin = !isLoading && realCount < MIN_REAL
  const lastReal = [...candles].reverse().find((c) => c.n > 0) ?? null

  return (
    <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xs text-zinc-400">{title}</h2>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-light tabular-nums text-zinc-100">
              {last == null
                ? '—'
                : inUsd
                  ? `$${(() => {
                      const t = candles[candles.length - 1]?.t ?? 0
                      const v = convert(last, t)
                      return v < 1 ? v.toPrecision(3) : v.toFixed(2)
                    })()}`
                  : formatPrice(last, inSats)}
            </span>
            <span className="text-xs text-zinc-500">{unit}</span>
          </div>
          {change != null && realCount >= MIN_REAL && (
            <div className={`mt-0.5 text-xs tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              <span className="text-zinc-600"> · {timeframe}</span>
            </div>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      {/* The container stays mounted even when empty: the chart instance is
          bound to it, and unmounting on every quiet asset would mean tearing
          the chart down and rebuilding it as the visitor switches pairs. */}
      <div className="relative">
        <div ref={containerRef} className={thin ? 'opacity-0' : undefined} />
        {thin && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            {lastReal ? (
              <>
                <p className="text-xs text-zinc-400">
                  Last sale {inUsd ? '$' : ''}
                  {inUsd
                    ? convert(lastReal.c, lastReal.t).toPrecision(3)
                    : formatPrice(lastReal.c, inSats)}{' '}
                  {!inUsd && unit}
                </p>
                <p className="text-[11px] text-zinc-600">
                  {new Date(lastReal.t * 1000).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' · '}
                  {realCount === 0
                    ? 'no trades in this window'
                    : `only ${realCount} trade${realCount === 1 ? '' : 's'} — too few to chart`}
                </p>
              </>
            ) : (
              <p className="text-xs text-zinc-600">No trades in this window.</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {CHART_TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTimeframeChange(t)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                t === timeframe
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {usdUnit && anchorsReady && (
            <button
              type="button"
              onClick={() => setShowUsd((v) => !v)}
              aria-pressed={inUsd}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                inUsd ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              USD
            </button>
          )}
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">
            {venue === 'market' ? 'DEX + pool' : 'Dispensers'}
          </span>
        </div>
      </div>
    </aside>
  )
}
