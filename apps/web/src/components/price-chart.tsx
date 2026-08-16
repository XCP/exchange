'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { PRICE_EVENTS } from '@/lib/price-events'
import { clusterEvents, type EventCluster } from '@/lib/cluster-events'

/**
 * The dollar-history chart, shared by /price/<coin> and the homepage hero.
 *
 * Lifted out of the price page when the hero needed the same thing including
 * the milestone annotations. It had been duplicated in a trimmed form for a
 * few hours; once the hero wanted markers too, one canvas with the extras
 * behind props beat two that drift.
 */
export type Coin = 'BTC' | 'XCP' | 'RATIO'
export const MARKER_COLOR = '#bbf7d0'

export function PriceChart({
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
