'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { usePriceHistory } from '@/lib/hooks/usePriceHistory'

/**
 * XCP in dollars, all of it.
 *
 * The same series /price/XCP draws on its All window — `usePriceHistory(true)`
 * is the deep calendar, and every row is used rather than a trailing slice.
 * All-time is the only honest default for the homepage: XCP has twelve years
 * of history and a shorter window on a thin market is mostly flat line.
 *
 * DELIBERATELY UNRELATED TO THE FORM BESIDE IT. This is not the market chart
 * for whatever pair the rail happens to be quoting — it is the price of the
 * protocol's token, which is context for being on the site at all. Coupling
 * the two would mean the chart changing when someone picks a different asset
 * in the form, which is a different page's job.
 *
 * A trimmed copy of /price/XCP's chart: same colours and axis treatment, none
 * of the milestone markers, tooltip or window switcher, because a hero chart
 * that can be hovered and re-scoped competes with the form it sits next to.
 * If this survives design iteration, that component and this one should be
 * merged into one shared chart with the extras behind props — it is ~40 lines
 * of duplicated setup today, kept separate only to avoid destabilising a
 * working page mid-iteration.
 */
export function XcpUsdChart({ height = 300 }: { height?: number }) {
  const { rows, isLoading } = usePriceHistory(true)
  const plotRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  const data = useMemo(
    () =>
      rows.map((r) => ({
        time: Math.floor(Date.parse(`${r.day}T00:00:00Z`) / 1000) as Time,
        value: r.xcp,
      })),
    [rows],
  )

  // Built once. Data and height are applied to the live chart afterwards, so a
  // new series does not tear down and rebuild the canvas on every render.
  useEffect(() => {
    if (!plotRef.current) return
    const chart = createChart(plotRef.current, {
      height,
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
      // Fixed: the hero is a glance, not an instrument. Panning it would also
      // fight the page scroll on a trackpad.
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
      priceFormat: {
        type: 'custom',
        minMove: 0.0001,
        formatter: (v: number) =>
          `$${v < 10 ? v.toFixed(4) : v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      },
    })
    chartRef.current = chart

    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: Math.floor(e.contentRect.width) }))
    ro.observe(plotRef.current)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.applyOptions({ height })
  }, [height])

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    seriesRef.current.setData(data)
    // All-time zoom: fit everything rather than leaving the default window.
    chartRef.current?.timeScale().fitContent()
  }, [data])

  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div ref={plotRef} style={{ height }} />
      {isLoading && data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
          Loading price…
        </div>
      )}
    </div>
  )
}
