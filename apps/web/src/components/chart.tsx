'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type Time, ColorType } from 'lightweight-charts'
import { useOhlc } from '@/lib/hooks/useOhlc'

interface ChartProps {
  pairSlug: string
  pairLabel?: string
}

function fmtPrice(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs < 0.0001) return n.toFixed(8)
  if (abs < 0.01) return n.toFixed(6)
  if (abs < 1) return n.toFixed(4)
  return n.toFixed(2)
}

export function Chart({ pairSlug, pairLabel }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [activeTimeframe, setActiveTimeframe] = useState('1D')
  const candlesRef = useRef<CandlestickData<Time>[]>([])

  // Fetch OHLC data from our API
  const { candles: rawCandles, isLoading } = useOhlc(pairSlug, activeTimeframe)

  // OHLC header values from crosshair or last candle
  const [ohlcHeader, setOhlcHeader] = useState<{ o: string; h: string; l: string; c: string; green: boolean } | null>(null)

  const initChart = useCallback(() => {
    if (!containerRef.current) return

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#52525b',
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#18181b' },
        horzLines: { color: '#18181b' },
      },
      crosshair: {
        vertLine: { color: '#3f3f46', width: 1, style: 3, labelBackgroundColor: '#27272a' },
        horzLine: { color: '#3f3f46', width: 1, style: 3, labelBackgroundColor: '#27272a' },
      },
      rightPriceScale: {
        borderColor: '#27272a',
        scaleMargins: { top: 0.08, bottom: 0.22 },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        minBarSpacing: 3,
      },
      handleScroll: true,
      handleScale: true,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef444480',
      wickUpColor: '#22c55e80',
      priceFormat: {
        type: 'custom',
        minMove: 0.00000001,
        formatter: (price: number) => {
          if (price === 0) return '0'
          const abs = Math.abs(price)
          if (abs < 0.0001) return price.toFixed(8)
          if (abs < 0.01) return price.toFixed(6)
          if (abs < 1) return price.toFixed(4)
          return price.toFixed(2)
        },
      },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    // Crosshair move → update OHLC header
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        // Reset to last candle
        const candles = candlesRef.current
        if (candles.length > 0) {
          const last = candles[candles.length - 1]
          setOhlcHeader({
            o: fmtPrice(last.open),
            h: fmtPrice(last.high),
            l: fmtPrice(last.low),
            c: fmtPrice(last.close),
            green: last.close >= last.open,
          })
        }
        return
      }
      const d = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined
      if (d) {
        setOhlcHeader({
          o: fmtPrice(d.open),
          h: fmtPrice(d.high),
          l: fmtPrice(d.low),
          c: fmtPrice(d.close),
          green: d.close >= d.open,
        })
      }
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
  }, [])

  // Create chart on mount
  useEffect(() => {
    initChart()
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [initChart])

  // Update chart data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !rawCandles.length) return

    const candles: CandlestickData<Time>[] = rawCandles.map((c) => ({
      time: c.t as Time,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }))

    const volumes: HistogramData<Time>[] = rawCandles.map((c) => ({
      time: c.t as Time,
      value: c.v,
      color: c.c >= c.o ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
    }))

    candlesRef.current = candles
    candleSeriesRef.current.setData(candles)
    volumeSeriesRef.current.setData(volumes)

    // Set OHLC header from last candle
    const last = candles[candles.length - 1]
    setOhlcHeader({
      o: fmtPrice(last.open),
      h: fmtPrice(last.high),
      l: fmtPrice(last.low),
      c: fmtPrice(last.close),
      green: last.close >= last.open,
    })

    chartRef.current?.timeScale().fitContent()
  }, [rawCandles])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container || !chartRef.current) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        chartRef.current?.applyOptions({ width, height })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [chartRef.current])

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 max-sm:hidden">{pairLabel ?? pairSlug}</span>
          <div className="flex items-center gap-0.5">
            {['1H', '4H', '1D', '1W', '1M'].map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                  tf === activeTimeframe
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        {ohlcHeader && (
          <div className="flex items-center gap-2 max-sm:hidden">
            <span className="text-xs text-zinc-600">O</span>
            <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.o}</span>
            <span className="text-xs text-zinc-600">H</span>
            <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.h}</span>
            <span className="text-xs text-zinc-600">L</span>
            <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.l}</span>
            <span className="text-xs text-zinc-600">C</span>
            <span className={`text-xs font-mono ${ohlcHeader.green ? 'text-green-400' : 'text-red-400'}`}>
              {ohlcHeader.c}
            </span>
          </div>
        )}
      </div>

      {/* Chart canvas */}
      <div className="relative" style={{ height: '300px', width: '100%' }}>
        {isLoading && !rawCandles.length && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
            Loading chart data...
          </div>
        )}
        {!isLoading && !rawCandles.length && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
            No candle data available
          </div>
        )}
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  )
}
