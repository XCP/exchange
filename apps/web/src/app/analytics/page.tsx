'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  createChart,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type Time,
  ColorType,
} from 'lightweight-charts'
import { useAnalytics } from '@/lib/hooks/useAnalytics'
import type {
  Timeframe,
  AnalyticsTopPair,
  AnalyticsTopDispenser,
  AnalyticsTopTrader,
} from '@/lib/hooks/useAnalytics'
import { formatPrice } from '@/utils/format-price'
import { useSatsMode } from '@/lib/sats-context'
import { XCP_IMG_BASE } from '@/utils/constants'

// ── Formatting helpers ──────────────────────────────────────────────

function fmtBig(n: number, decimals = 2): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(decimals) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(decimals) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  if (n >= 1) return n.toFixed(decimals)
  if (n > 0) return n.toFixed(4)
  return '0'
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  if (v === 0) return '0.0%'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function pctColor(v: number | null): string {
  if (v == null || v === 0) return 'text-zinc-600'
  return v > 0 ? 'text-green-400' : 'text-red-400'
}

const TF_LABELS: Record<Timeframe, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  all: 'All',
}

// ── Shared chart options ────────────────────────────────────────────

function baseChartOptions() {
  return {
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
  }
}

// ── CounterCard ─────────────────────────────────────────────────────

function CounterCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-mono font-semibold text-zinc-100">{value}</div>
      {sub && <div className="text-xs text-zinc-500 font-mono mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Chart wrapper hook ──────────────────────────────────────────────

function useChartContainer(height: number = 220) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  return { containerRef, chartRef, height }
}

// ── Monthly aggregation helper ──────────────────────────────────────

function mergeDailyVolumes(...sources: { timestamp: number; volume: number }[][]): { timestamp: number; volume: number }[] {
  const buckets = new Map<number, number>()
  for (const src of sources) {
    for (const d of src) {
      buckets.set(d.timestamp, (buckets.get(d.timestamp) ?? 0) + d.volume)
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, volume]) => ({ timestamp, volume }))
}

function aggregateMonthly(data: { timestamp: number; volume: number }[]): { time: Time; value: number }[] {
  if (data.length === 0) return []
  const buckets = new Map<string, number>()
  for (const d of data) {
    const date = new Date(d.timestamp * 1000)
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    buckets.set(key, (buckets.get(key) ?? 0) + d.volume)
  }
  // Fill in all months between first and last with zeros
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

// ── ComboVolumeChart (monthly bars + cumulative line) ───────────────

function ComboVolumeChart({
  data,
  color,
  label,
}: {
  data: { timestamp: number; volume: number }[]
  color: string
  label: string
}) {
  const { containerRef, chartRef } = useChartContainer(280)
  const height = 280

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      ...baseChartOptions(),
      width: containerRef.current.clientWidth,
      height,
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

    // Both series must use monthly timestamps so bars render at month width
    const monthlyData = aggregateMonthly(data)

    // Cumulative line on left axis (running total of monthly buckets)
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
    })
    lineSeries.setData(cumulativeData)

    // Monthly bars on right axis
    const histSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'custom', formatter: (v: number) => fmtBig(v) },
      priceScaleId: 'right',
      lastValueVisible: false,
    })
    histSeries.setData(
      monthlyData.map((d) => ({ ...d, color: color + '99' }))
    )

    chart.timeScale().fitContent()
    chartRef.current = chart

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [data, color, height]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-4">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color + '99' }} />
          <span className="text-[10px] text-zinc-600">Monthly</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5" style={{ backgroundColor: color }} />
          <span className="text-[10px] text-zinc-600">Cumulative</span>
        </span>
      </div>
      <div ref={containerRef} style={{ height, width: '100%' }} />
    </div>
  )
}

// ── LeaderboardTable ────────────────────────────────────────────────

function TopPairsTable({ pairs, tfLabel }: { pairs: AnalyticsTopPair[]; tfLabel: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">Top Pairs ({tfLabel} Trades)</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">#</th>
            <th className="text-left font-normal px-3 py-1.5">Pair</th>
            <th className="text-right font-normal px-3 py-1.5">Trades</th>
            <th className="text-right font-normal px-3 py-1.5">Chg</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, i) => (
            <tr key={p.pair} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
              <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
              <td className="px-3 py-1.5">
                <Link href={`/trade/${p.pair}`} className="flex items-center gap-1.5 hover:underline">
                  <Image
                    src={`${XCP_IMG_BASE}/icon/${p.base_asset}`}
                    alt=""
                    width={14}
                    height={14}
                    className="rounded-sm"
                    unoptimized
                  />
                  <span className="text-zinc-200">{(p.base_asset_longname ?? p.base_asset)}/{p.quote_asset}</span>
                </Link>
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">{p.trade_count.toLocaleString()}</td>
              <td className={`text-right font-mono px-3 py-1.5 ${pctColor(p.price_change)}`}>
                {fmtPct(p.price_change)}
              </td>
            </tr>
          ))}
          {pairs.length === 0 && (
            <tr><td colSpan={4} className="text-center py-6 text-zinc-600">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TopDispensersTable({ dispensers, tfLabel, satsMode }: { dispensers: AnalyticsTopDispenser[]; tfLabel: string; satsMode: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 text-xs text-zinc-500">Top Dispensers ({tfLabel} Volume)</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">#</th>
            <th className="text-left font-normal px-3 py-1.5">Asset</th>
            <th className="text-right font-normal px-3 py-1.5">Volume</th>
            <th className="text-right font-normal px-3 py-1.5">Chg</th>
          </tr>
        </thead>
        <tbody>
          {dispensers.map((d, i) => (
            <tr key={d.asset} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
              <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
              <td className="px-3 py-1.5">
                <Link href={`/dispense/${d.asset}`} className="flex items-center gap-1.5 hover:underline">
                  <Image
                    src={`${XCP_IMG_BASE}/icon/${d.asset}`}
                    alt=""
                    width={14}
                    height={14}
                    className="rounded-sm"
                    unoptimized
                  />
                  <span className="text-zinc-200">{d.asset_longname ?? d.asset}</span>
                </Link>
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">{formatPrice(d.volume, satsMode)}</td>
              <td className={`text-right font-mono px-3 py-1.5 ${pctColor(d.price_change)}`}>
                {fmtPct(d.price_change)}
              </td>
            </tr>
          ))}
          {dispensers.length === 0 && (
            <tr><td colSpan={4} className="text-center py-6 text-zinc-600">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── TopTradersTable ──────────────────────────────────────────────────

function TopTradersTable({
  title,
  unit,
  tabLabels,
  listA,
  listB,
}: {
  title: string
  unit: string
  tabLabels: [string, string]
  listA: AnalyticsTopTrader[]
  listB: AnalyticsTopTrader[]
}) {
  const [tab, setTab] = useState<0 | 1>(0)
  const [sortBy, setSortBy] = useState<'volume' | 'trades'>('volume')
  const raw = tab === 0 ? listA : listB
  const list = [...raw].sort((a, b) => b[sortBy] - a[sortBy])

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className="flex gap-0.5 ml-auto">
          {tabLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i as 0 | 1)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
                tab === i
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-600 border-b border-zinc-800">
            <th className="text-left font-normal px-3 py-1.5">#</th>
            <th className="text-left font-normal px-3 py-1.5">Address</th>
            <th
              className={`text-right font-normal px-3 py-1.5 cursor-pointer select-none hover:text-zinc-400 ${sortBy === 'volume' ? 'text-zinc-300' : ''}`}
              onClick={() => setSortBy('volume')}
            >
              Volume ({unit}) {sortBy === 'volume' ? '▼' : ''}
            </th>
            <th
              className={`text-right font-normal px-3 py-1.5 cursor-pointer select-none hover:text-zinc-400 ${sortBy === 'trades' ? 'text-zinc-300' : ''}`}
              onClick={() => setSortBy('trades')}
            >
              Trades {sortBy === 'trades' ? '▼' : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((t, i) => (
            <tr key={t.address} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 last:border-0">
              <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
              <td className="px-3 py-1.5 text-zinc-300 font-mono text-[11px] break-all">
                {t.address}
              </td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">{fmtBig(t.volume)}</td>
              <td className="text-right text-zinc-400 font-mono px-3 py-1.5">{t.trades.toLocaleString()}</td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr><td colSpan={4} className="text-center py-6 text-zinc-600">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { satsMode } = useSatsMode()
  const btcLabel = satsMode ? 'sats' : 'BTC'
  const [timeframe, setTimeframe] = useState<Timeframe>('all')
  const [hideLowQuality, setHideLowQuality] = useState(true)

  const {
    tradeSummary,
    dispenseSummary,
    dailyTradeVolume,
    dailyDispenseVolume,
    dailyBtcTradeVolume,
    topPairs,
    topDispensers,
    quoteVolumes,
    topMakers,
    topTakers,
    topBtcBuyers,
    topBtcSellers,
    isLoading,
  } = useAnalytics(timeframe, !hideLowQuality)

  const tfLabel = TF_LABELS[timeframe]
  const isAll = timeframe === 'all'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header + Controls */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 mb-1">DEX Analytics</h1>
            <p className="text-xs text-zinc-500">Global exchange metrics, volume trends, and leaderboards</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideLowQuality}
                onChange={(e) => setHideLowQuality(e.target.checked)}
                className="accent-zinc-500 w-3 h-3"
              />
              <span className="text-xs text-zinc-500">Hide low quality</span>
            </label>
            <div className="flex gap-0.5">
              {(['24h', '7d', '30d', 'all'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 text-xs font-mono rounded-sm transition-colors ${
                    timeframe === tf
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {TF_LABELS[tf]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-zinc-500">Loading analytics...</span>
          </div>
        ) : (
          <>
            {/* Counter Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {/* Row 1: Order book trading */}
              <CounterCard
                label="Trade Volume"
                value={tradeSummary ? fmtBig(tradeSummary.tf_volume) + ' XCP' : '—'}
                sub={tradeSummary && tradeSummary.tf_trades > 0 ? `Avg: ${fmtBig(tradeSummary.tf_volume / tradeSummary.tf_trades)} XCP` : undefined}
              />
              <CounterCard
                label="Orders Placed"
                value={tradeSummary ? tradeSummary.tf_orders.toLocaleString() : '—'}
                sub={tradeSummary ? `${tradeSummary.open_orders.toLocaleString()} open` : undefined}
              />
              <CounterCard
                label="Trades"
                value={tradeSummary ? tradeSummary.tf_trades.toLocaleString() : '—'}
                sub={tradeSummary?.tf_unique_traders ? `${tradeSummary.tf_unique_traders.toLocaleString()} addresses` : undefined}
              />
              <CounterCard
                label="Active Pairs"
                value={tradeSummary ? tradeSummary.active_pairs.toLocaleString() : '—'}
                sub={tradeSummary ? (isAll ? `${tradeSummary.total_pairs.toLocaleString()} total` : tradeSummary.new_pairs ? `${tradeSummary.new_pairs.toLocaleString()} new` : undefined) : undefined}
              />
              {/* Row 2: Dispensers */}
              <CounterCard
                label="Dispense Volume"
                value={dispenseSummary ? fmtBig(dispenseSummary.tf_volume) + ` ${btcLabel.toUpperCase()}` : '—'}
                sub={dispenseSummary && dispenseSummary.tf_dispenses > 0 ? `Avg: ${fmtBig(dispenseSummary.tf_volume / dispenseSummary.tf_dispenses)} ${btcLabel.toUpperCase()}` : undefined}
              />
              <CounterCard
                label="Dispensers Created"
                value={dispenseSummary ? dispenseSummary.tf_dispensers_created.toLocaleString() : '—'}
                sub={dispenseSummary ? `${dispenseSummary.open_dispensers.toLocaleString()} open` : undefined}
              />
              <CounterCard
                label="Dispenses"
                value={dispenseSummary ? dispenseSummary.tf_dispenses.toLocaleString() : '—'}
                sub={dispenseSummary?.tf_unique_buyers ? `${dispenseSummary.tf_unique_buyers.toLocaleString()} addresses` : undefined}
              />
              <CounterCard
                label="Active Dispensers"
                value={dispenseSummary ? dispenseSummary.active_assets.toLocaleString() : '—'}
                sub={dispenseSummary ? (isAll ? `${dispenseSummary.total_assets.toLocaleString()} total` : dispenseSummary.new_assets ? `${dispenseSummary.new_assets.toLocaleString()} new` : undefined) : undefined}
              />
            </div>

            {/* Quote Volume Marquee Ticker */}
            {quoteVolumes.length > 0 && (() => {
              // Repeat enough to guarantee overflow, then duplicate for seamless loop
              const reps = Math.max(2, Math.ceil(8 / quoteVolumes.length))
              const strip = Array(reps).fill(quoteVolumes).flat()
              return (
              <div className="group overflow-hidden mb-6 bg-zinc-900/50 border border-zinc-800 rounded-sm">
                <div
                  className="flex w-max gap-4 py-2 group-hover:[animation-play-state:paused]"
                  style={{ animation: `marquee ${Math.max(strip.length * 6, 40)}s linear infinite` }}
                >
                  {[...strip, ...strip].map((q, i) => (
                    <div key={`${q.quote_asset}-${i}`} className="flex items-center gap-2 shrink-0 min-w-0 px-3">
                      <Image
                        src={`${XCP_IMG_BASE}/icon/${q.quote_asset}`}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-sm"
                        unoptimized
                      />
                      <span className="text-xs text-zinc-400 font-mono">{q.quote_asset}</span>
                      <span className="text-xs text-zinc-200 font-mono font-semibold">{q.trade_count.toLocaleString()} trades</span>
                      <span className="text-[10px] text-zinc-600 font-mono">{fmtBig(q.volume)} vol</span>
                    </div>
                  ))}
                </div>
              </div>
              )
            })()}

            {/* Leaderboards */}
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Leaderboards</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
              <TopPairsTable pairs={topPairs} tfLabel={tfLabel} />
              <TopDispensersTable dispensers={topDispensers} tfLabel={tfLabel} satsMode={satsMode} />
            </div>

            {/* Volume History */}
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Volume History</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
              <ComboVolumeChart
                data={dailyTradeVolume}
                color="#22c55e"
                label="Trade Volume (XCP)"
              />
              <ComboVolumeChart
                data={mergeDailyVolumes(dailyBtcTradeVolume, dailyDispenseVolume)}
                color="#3b82f6"
                label="Trade Volume (BTC)"
              />
            </div>

            {/* Top Traders */}
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Top Traders</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <TopTradersTable
                title="Top Traders (XCP)"
                unit="XCP"
                tabLabels={['Makers', 'Takers']}
                listA={topMakers}
                listB={topTakers}
              />
              <TopTradersTable
                title="Top Traders (BTC)"
                unit="BTC"
                tabLabels={['Makers', 'Takers']}
                listA={topBtcSellers}
                listB={topBtcBuyers}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
