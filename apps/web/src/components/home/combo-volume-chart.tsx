'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type Time,
  ColorType,
} from 'lightweight-charts'
import { fmtBig } from '@/utils/format-analytics'

const BASE_CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid as const, color: 'transparent' },
    textColor: '#52525b',
    fontFamily: 'var(--font-geist-mono), monospace',
    fontSize: 10,
  },
  grid: {
    vertLines: { color: '#18181b' },
    horzLines: { color: '#18181b' },
  },
  rightPriceScale: {
    borderColor: '#27272a',
    scaleMargins: { top: 0.1, bottom: 0.05 },
  },
  timeScale: {
    borderColor: '#27272a',
    timeVisible: false,
    fixLeftEdge: true,
    fixRightEdge: true,
  },
  handleScroll: true,
  handleScale: true,
  crosshair: {
    vertLine: { color: '#3f3f46', width: 1 as const, style: 3 as const, labelBackgroundColor: '#27272a' },
    horzLine: { color: '#3f3f46', width: 1 as const, style: 3 as const, labelBackgroundColor: '#27272a' },
  },
} as const

function aggregateMonthly(data: { timestamp: number; volume: number }[]): { time: Time; value: number }[] {
  if (data.length === 0) return []
  const buckets = new Map<string, number>()
  for (const d of data) {
    const date = new Date(d.timestamp * 1000)
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    buckets.set(key, (buckets.get(key) ?? 0) + d.volume)
  }
  const sorted = Array.from(buckets.keys()).sort()
  const [startY, startM] = sorted[0].split('-').map(Number)
  const [endY, endM] = sorted[sorted.length - 1].split('-').map(Number)
  const result: { time: Time; value: number }[] = []
  let y = startY, m = startM
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const ts = Math.floor(Date.UTC(y, m - 1, 1) / 1000)
    result.push({ time: ts as Time, value: buckets.get(key) ?? 0 })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

const HEIGHT = 280

export default function ComboVolumeChart({
  data,
  color,
  label,
}: {
  data: { timestamp: number; volume: number }[]
  color: string
  label: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  // Create/destroy chart when data or color changes
  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    chartRef.current?.remove()

    const chart = createChart(containerRef.current, {
      ...BASE_CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: HEIGHT,
      leftPriceScale: {
        visible: true,
        borderColor: '#27272a',
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#27272a',
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
    })

    const monthlyData = aggregateMonthly(data)

    let cumulative = 0
    const cumulativeData = monthlyData.map((d) => {
      cumulative += d.value
      return { time: d.time, value: cumulative }
    })
    const lineSeries = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: (v: number) => fmtBig(v) },
      priceScaleId: 'left',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    lineSeries.setData(cumulativeData)

    const histSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'custom', formatter: (v: number) => fmtBig(v) },
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    histSeries.setData(
      monthlyData.map((d) => ({ ...d, color: color + '99' }))
    )

    chart.timeScale().fitContent()
    chartRef.current = chart

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [data, color])

  // ResizeObserver — independent of data, reads chartRef at callback time
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chartRef.current?.applyOptions({ width: entry.contentRect.width })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-4">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color + '99' }} />
          <span className="text-[10px] text-zinc-500">Monthly</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5" style={{ backgroundColor: color }} />
          <span className="text-[10px] text-zinc-500">Cumulative</span>
        </span>
      </div>
      <div ref={containerRef} style={{ height: HEIGHT, width: '100%' }} />
    </div>
  )
}
