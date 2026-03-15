'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, AreaSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type AreaData, type HistogramData, type Time, ColorType } from 'lightweight-charts'
import { useOhlc } from '@/lib/hooks/useOhlc'

interface ChartProps {
  pairSlug: string
  pairLabel?: string
}

type ChartMode = 'candles' | 'line'

const ALL_TIMEFRAMES = ['1H', '4H', '1D', '1W', '1M', '1Y'] as const

// Minimum real candles needed to show a timeframe button
const MIN_REAL_CANDLES = 3

function fmtPrice(n: number): string {
  return n.toFixed(8)
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  if (n >= 1) return n.toFixed(2)
  if (n > 0) return n.toFixed(4)
  return '0'
}

export function Chart({ pairSlug, pairLabel }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [activeTimeframe, setActiveTimeframe] = useState('1Y')
  const [chartMode, setChartMode] = useState<ChartMode>('candles')
  const candlesRef = useRef<CandlestickData<Time>[]>([])
  const volumesRef = useRef<HistogramData<Time>[]>([])
  const prevCandleCount = useRef(0)

  // Fetch OHLC data from our API
  const { candles: rawCandles, realCandleCount, isLoading, loadMore, loadingMore, hasMore } = useOhlc(pairSlug, activeTimeframe)

  // Auto-bump to 1D if sub-daily timeframe has too few real candles
  const hasAutoSelected = useRef(false)
  useEffect(() => {
    if (hasAutoSelected.current) return
    if (!isLoading && rawCandles.length > 0) {
      if ((activeTimeframe === '1H' || activeTimeframe === '4H') && realCandleCount < MIN_REAL_CANDLES) {
        setActiveTimeframe('1D')
      }
      hasAutoSelected.current = true
    }
  }, [isLoading, rawCandles.length, realCandleCount, activeTimeframe])

  // Reset auto-select flag and candle count when pair or timeframe changes
  useEffect(() => {
    hasAutoSelected.current = false
    prevCandleCount.current = 0
  }, [pairSlug, activeTimeframe])

  // OHLC header values from crosshair or last candle
  const [ohlcHeader, setOhlcHeader] = useState<{ o: string; h: string; l: string; c: string; v: string; green: boolean } | null>(null)

  // Ref to track current chart mode inside crosshair callback
  const chartModeRef = useRef(chartMode)
  chartModeRef.current = chartMode

  const initChart = () => {
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
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        minMove: 0.00000001,
        formatter: fmtPrice,
      },
    })

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.18)',
      bottomColor: 'rgba(34, 197, 94, 0.02)',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderColor: '#22c55e',
      crosshairMarkerBackgroundColor: '#09090b',
      visible: false,
      priceFormat: {
        type: 'custom',
        minMove: 0.00000001,
        formatter: fmtPrice,
      },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    // Crosshair move → update header
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        // Reset to last candle
        const candles = candlesRef.current
        if (candles.length > 0) {
          const last = candles[candles.length - 1]
          const lastVol = volumesRef.current[volumesRef.current.length - 1]
          setOhlcHeader({
            o: fmtPrice(last.open),
            h: fmtPrice(last.high),
            l: fmtPrice(last.low),
            c: fmtPrice(last.close),
            v: fmtVol(lastVol?.value ?? 0),
            green: last.close >= last.open,
          })
        }
        return
      }
      const vol = param.seriesData.get(volumeSeries) as HistogramData<Time> | undefined
      if (chartModeRef.current === 'line') {
        const d = param.seriesData.get(areaSeries) as AreaData<Time> | undefined
        if (d) {
          // For line mode, use close value for all OHLC fields
          setOhlcHeader({
            o: fmtPrice(d.value),
            h: fmtPrice(d.value),
            l: fmtPrice(d.value),
            c: fmtPrice(d.value),
            v: fmtVol(vol?.value ?? 0),
            green: true,
          })
        }
      } else {
        const d = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined
        if (d) {
          setOhlcHeader({
            o: fmtPrice(d.open),
            h: fmtPrice(d.high),
            l: fmtPrice(d.low),
            c: fmtPrice(d.close),
            v: fmtVol(vol?.value ?? 0),
            green: d.close >= d.open,
          })
        }
      }
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    areaSeriesRef.current = areaSeries
    volumeSeriesRef.current = volumeSeries
  }

  // Create chart on mount
  useEffect(() => {
    initChart()
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  // Toggle series visibility when chart mode changes
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: chartMode === 'candles' })
    areaSeriesRef.current?.applyOptions({ visible: chartMode === 'line' })
  }, [chartMode])

  // Update chart data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !areaSeriesRef.current || !volumeSeriesRef.current || !rawCandles.length) return

    const candles: CandlestickData<Time>[] = rawCandles.map((c) => ({
      time: c.t as Time,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }))

    const areaData: AreaData<Time>[] = rawCandles.map((c) => ({
      time: c.t as Time,
      value: c.c,
    }))

    const volumes: HistogramData<Time>[] = rawCandles.map((c) => ({
      time: c.t as Time,
      value: c.v,
      color: c.c >= c.o ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
    }))

    candlesRef.current = candles
    volumesRef.current = volumes
    candleSeriesRef.current.setData(candles)
    areaSeriesRef.current.setData(areaData)
    volumeSeriesRef.current.setData(volumes)

    // Set OHLC header from last candle
    const last = candles[candles.length - 1]
    const lastVol = volumes[volumes.length - 1]
    setOhlcHeader({
      o: fmtPrice(last.open),
      h: fmtPrice(last.high),
      l: fmtPrice(last.low),
      c: fmtPrice(last.close),
      v: fmtVol(lastVol?.value ?? 0),
      green: last.close >= last.open,
    })

    // Only fitContent on initial load, not when prepending history
    const isInitialLoad = prevCandleCount.current === 0
    prevCandleCount.current = candles.length
    if (isInitialLoad) {
      chartRef.current?.timeScale().fitContent()
    }
  }, [rawCandles])

  // Lazy-load older candles when user scrolls to the left edge
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const loadingMoreRef = useRef(loadingMore)
  loadingMoreRef.current = loadingMore

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const handler = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange || !hasMoreRef.current || loadingMoreRef.current) return
      // When the user scrolls so that the leftmost visible bar is within
      // 10 bars of the data start, trigger a load
      if (logicalRange.from < 10) {
        loadMoreRef.current()
      }
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange(handler)
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCandles])

  // Resize observer — runs once after chart is initialized
  useEffect(() => {
    const container = containerRef.current
    const chart = chartRef.current
    if (!container || !chart) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        chart.applyOptions({ width, height })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCandles])

  // Adjust time formatting based on timeframe
  useEffect(() => {
    if (!chartRef.current) return
    const showTime = activeTimeframe === '1H' || activeTimeframe === '4H'
    chartRef.current.applyOptions({
      localization: {
        timeFormatter: (time: unknown) => {
          const d = new Date((time as number) * 1000)
          if (activeTimeframe === '1Y') return d.getUTCFullYear().toString()
          if (activeTimeframe === '1M')
            return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
          if (activeTimeframe === '1W' || activeTimeframe === '1D')
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
          return d.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
          })
        },
      },
      timeScale: { timeVisible: showTime },
    })
  }, [activeTimeframe])

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 max-sm:hidden">{pairLabel ?? pairSlug}</span>
          <div className="flex items-center gap-0.5">
            {ALL_TIMEFRAMES.map((tf) => (
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
          <div className="flex items-center gap-0.5 ml-1 border-l border-zinc-800 pl-2">
            <button
              onClick={() => setChartMode('candles')}
              className={`px-1.5 py-0.5 rounded-sm transition-colors ${
                chartMode === 'candles' ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              title="Candlestick"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="4" y1="1" x2="4" y2="13" />
                <rect x="2" y="4" width="4" height="5" fill="currentColor" stroke="currentColor" strokeWidth="1" rx="0.5" />
                <line x1="10" y1="1" x2="10" y2="13" />
                <rect x="8" y="6" width="4" height="5" fill="currentColor" stroke="currentColor" strokeWidth="1" rx="0.5" />
              </svg>
            </button>
            <button
              onClick={() => setChartMode('line')}
              className={`px-1.5 py-0.5 rounded-sm transition-colors ${
                chartMode === 'line' ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              title="Line"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1,10 4,6 7,8 10,3 13,5" />
              </svg>
            </button>
          </div>
        </div>
        {ohlcHeader && (
          <div className="flex items-center gap-2 max-sm:hidden">
            <span className="text-xs text-zinc-500">Volume</span>
            <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.v}</span>
            {chartMode === 'candles' ? (
              <>
                <span className="text-xs text-zinc-500">O</span>
                <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.o}</span>
                <span className="text-xs text-zinc-500">H</span>
                <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.h}</span>
                <span className="text-xs text-zinc-500">L</span>
                <span className="text-xs text-zinc-300 font-mono">{ohlcHeader.l}</span>
                <span className="text-xs text-zinc-500">C</span>
                <span className={`text-xs font-mono ${ohlcHeader.green ? 'text-green-400' : 'text-red-400'}`}>
                  {ohlcHeader.c}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-zinc-500">Price</span>
                <span className="text-xs font-mono text-green-400">{ohlcHeader.c}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Chart canvas */}
      <div className="relative" style={{ height: '300px', width: '100%' }}>
        {isLoading && !rawCandles.length && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
            Loading chart data...
          </div>
        )}
        {!isLoading && !rawCandles.length && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
            No candle data available
          </div>
        )}
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
        {loadingMore && (
          <div className="absolute top-2 left-2 text-xs text-zinc-500">
            Loading history...
          </div>
        )}
      </div>
    </div>
  )
}
