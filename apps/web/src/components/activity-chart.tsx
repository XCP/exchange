'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  HistogramSeries,
  type IChartApi,
  type Time,
  ColorType,
} from 'lightweight-charts'

const CHART_OPTIONS = {
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

interface ActivityDay {
  day: string
  trades: number
  dispenses: number
  orders_placed: number
  dispensers_created: number
  sends: number
}

interface MonthBucket {
  time: Time
  orders: number
  dispensers: number
  sends: number
}

const COLORS = {
  orders: '#22c55e',      // green (DEX)
  dispensers: '#3b82f6',  // blue (BTC)
  sends: '#f59e0b',       // amber
}

function aggregateMonthly(data: ActivityDay[]): MonthBucket[] {
  if (data.length === 0) return []
  const buckets = new Map<string, { orders: number; dispensers: number; sends: number }>()
  for (const d of data) {
    const key = d.day.slice(0, 7)
    const b = buckets.get(key) ?? { orders: 0, dispensers: 0, sends: 0 }
    b.orders += (d.orders_placed || 0) + (d.trades || 0)
    b.dispensers += (d.dispenses || 0) + (d.dispensers_created || 0)
    b.sends += d.sends || 0
    buckets.set(key, b)
  }
  const sorted = Array.from(buckets.keys()).sort()
  const [startY, startM] = sorted[0].split('-').map(Number)
  const [endY, endM] = sorted[sorted.length - 1].split('-').map(Number)
  const result: MonthBucket[] = []
  let y = startY, m = startM
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const ts = Math.floor(Date.UTC(y, m - 1, 1) / 1000) as Time
    const b = buckets.get(key)
    result.push({
      time: ts,
      orders: b?.orders ?? 0,
      dispensers: b?.dispensers ?? 0,
      sends: b?.sends ?? 0,
    })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

const HEIGHT = 380

type Layer = 'sends' | 'orders' | 'dispensers'

function buildStackedData(monthly: MonthBucket[], visible: Record<Layer, boolean>) {
  // Build cumulative stacks from bottom to top based on what's visible
  const layers: Layer[] = ['sends', 'orders', 'dispensers']
  const activeLayers = layers.filter(l => visible[l])

  return activeLayers.map((layer, layerIdx) => {
    const color = COLORS[layer]
    return monthly.map(d => {
      // Value is the sum of this layer and all layers below it (that are visible)
      let val = 0
      for (let i = 0; i <= layerIdx; i++) {
        val += d[activeLayers[i]]
      }
      return { time: d.time, value: val, color }
    })
  })
}

export function ActivityChart({ data }: { data: ActivityDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [visible, setVisible] = useState<Record<Layer, boolean>>({
    sends: true, orders: true, dispensers: true,
  })

  const toggle = (layer: Layer) => {
    setVisible(prev => ({ ...prev, [layer]: !prev[layer] }))
  }

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    chartRef.current?.remove()

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: HEIGHT,
    })

    const monthly = aggregateMonthly(data)
    const stacks = buildStackedData(monthly, visible)

    // Draw from back (tallest) to front (shortest)
    for (let i = stacks.length - 1; i >= 0; i--) {
      const series = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'custom', formatter: (v: number) => v.toLocaleString() },
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      series.setData(stacks[i])
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [data, visible])

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

  const totals = data.reduce(
    (acc, d) => ({
      sends: acc.sends + (d.sends || 0),
      orders: acc.orders + (d.orders_placed || 0) + (d.trades || 0),
      dispensers: acc.dispensers + (d.dispenses || 0) + (d.dispensers_created || 0),
    }),
    { sends: 0, orders: 0, dispensers: 0 }
  )
  const total = totals.sends + totals.orders + totals.dispensers

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-zinc-500">Activity</span>
        {([
          ['sends', 'Sends', totals.sends],
          ['orders', 'Orders', totals.orders],
          ['dispensers', 'Dispensers', totals.dispensers],
        ] as const).filter(([, , count]) => count > 0).map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggle(key as Layer)}
            className={`flex items-center gap-1 cursor-pointer ${visible[key as Layer] ? '' : 'opacity-30'}`}
          >
            <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: COLORS[key as Layer] }} />
            <span className="text-[10px] text-zinc-500">{label}</span>
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600 font-mono tabular-nums">{total.toLocaleString()} total</span>
      </div>
      <div ref={containerRef} style={{ height: HEIGHT, width: '100%' }} />
    </div>
  )
}
