import { useMemo } from 'react'
import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import type { OhlcCandle } from '@/lib/hooks/useOhlc'

/**
 * Price history for the panel beside a trading form.
 *
 * Two venues, deliberately kept apart rather than blended. A DEX pair is
 * priced in its quote asset and already merges the order book with the AMM
 * pool; a dispenser sale is priced in BITCOIN. Putting them on one axis would
 * need a BTC↔XCP rate our own data can't supply — the XCP/BTC book has two
 * real trade days in the last year — so the panel charts one or the other and
 * says which.
 *
 * Separate from `useOhlc`, which carries pagination and history accumulation
 * for the full-page chart. A panel shows a fixed window and never scrolls
 * back, so none of that machinery earns its place here.
 */
export type ChartVenue = 'market' | 'dispensers'

export const CHART_TIMEFRAMES = ['1D', '1W', '1M', '1Y', 'All'] as const
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number]

/**
 * Which window to open on, from a market's last trade.
 *
 * Measured against production: of the top 500 markets by all-time volume,
 * ONE had traded in the last 30 days, 22 within a year, and 477 — 95% — not
 * for over a year. A fixed 1M default therefore renders a flat carried-forward
 * line almost everywhere.
 *
 * Derived rather than detected: `last_trade_time` already rides along on the
 * market data these pages fetch to render anything at all, so this costs no
 * request. Probing the API for density would trade a round-trip for an answer
 * we are already holding.
 */
export function defaultTimeframe(lastTradeTime: number | null | undefined): ChartTimeframe {
  if (!lastTradeTime) return 'All'
  const ageDays = (Date.now() / 1000 - lastTradeTime) / 86400
  if (ageDays <= 30) return '1M'
  if (ageDays <= 365) return '1Y'
  return 'All'
}

/**
 * A timeframe is a WINDOW, and the bucket size follows from it — roughly
 * 24-52 points each, which is enough to read a shape without turning a
 * quiet market into a row of identical carried-forward candles.
 */
export const TIMEFRAME_SPEC: Record<ChartTimeframe, { interval: string; limit: number }> = {
  '1D': { interval: '1h', limit: 24 },
  '1W': { interval: '4h', limit: 42 },
  '1M': { interval: '1d', limit: 30 },
  '1Y': { interval: '1w', limit: 52 },
  // Monthly buckets at the API's 500-row ceiling reach back ~41 years, which
  // comfortably clears Counterparty's 2014 genesis. The dense grid drops
  // leading buckets that have no price to carry, so the series still begins
  // at the asset's first real trade rather than at an empty 1985.
  All: { interval: '1m', limit: 500 },
}

interface SeriesResponse {
  candles: OhlcCandle[]
}

export function useTradeSeries({
  venue,
  pairSlug,
  asset,
  timeframe,
}: {
  venue: ChartVenue
  /** BASE_QUOTE, for the market venue. */
  pairSlug: string | null
  /** Protocol asset name, for the dispenser venue. */
  asset: string | null
  timeframe: ChartTimeframe
}) {
  const { interval, limit } = TIMEFRAME_SPEC[timeframe]
  const target = venue === 'market' ? pairSlug : asset
  const path =
    venue === 'market'
      ? `/ohlc/${target}?interval=${interval}&limit=${limit}`
      : `/dispenses/ohlc/${target}?interval=${interval}&limit=${limit}`

  const { data, error, isLoading } = useDexSWR<SeriesResponse>(
    target ? dexUrl(path) : null,
    { revalidateOnFocus: false },
  )

  return useMemo(() => {
    const candles = data?.candles ?? []
    // `n === 0` is a carried-forward filler, not a trade. Counting them would
    // report a busy market for an asset that hasn't traded in a year.
    const real = candles.filter((c) => c.n > 0)
    const first = candles[0]
    const last = candles[candles.length - 1]
    /**
     * Close-to-close, because the chart draws CLOSES.
     *
     * Measuring from the first candle's OPEN is the usual finance convention,
     * but it silently disagrees with the line above it whenever price moved
     * far inside that first bucket. PEPECASH all-time is the extreme case:
     * its first month opened at 0.1 and closed at 0.0000101, so an open-based
     * reading showed -96% above a line that visibly rises ~39,000%. The badge
     * has to describe the series actually plotted.
     */
    const change =
      first && last && first.c > 0 ? ((last.c - first.c) / first.c) * 100 : null

    return {
      candles,
      realCount: real.length,
      last: last?.c ?? null,
      change,
      error,
      isLoading,
    }
  }, [data, error, isLoading])
}
