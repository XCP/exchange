import { useMemo } from 'react'
import { dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'
import type { OhlcCandle } from '@/lib/hooks/useOhlc'

/**
 * Price history for the panel beside a trading form.
 *
 * Three venues. A DEX pair is priced in its quote asset and already merges the
 * order book with the AMM pool; a dispenser sale is priced in BITCOIN. For most
 * pairs those two cannot share an axis without a BTC↔XCP rate our own data
 * can't supply, so the panel charts one or the other and says which.
 *
 * `all` is the exception, and only for BTC-QUOTED pairs. There the denominations
 * already agree — an XCP/BTC match and an XCP dispense are both BTC-per-XCP —
 * so the two merge with nothing converted and nothing invented. The API refuses
 * the blend for any other quote asset rather than fabricate a cross-rate.
 *
 * It matters most exactly where the old comment said blending was impossible.
 * Over the 365 days to 2026-08-25 the XCP/BTC book saw 5 days and SIX fills;
 * dispensers saw 325 days and 1,635 fills, 30x the volume. 'market' alone drew
 * 3% of that market and left the rest behind a toggle.
 *
 * Separate from `useOhlc`, which carries pagination and history accumulation
 * for the full-page chart. A panel shows a fixed window and never scrolls
 * back, so none of that machinery earns its place here.
 */
export type ChartVenue = 'market' | 'dispensers' | 'all'

/** Blending is defined only where both venues already price in bitcoin. */
export const canBlendVenues = (pairSlug: string | null | undefined) =>
  !!pairSlug && pairSlug.endsWith('_BTC')

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
  // 'all' reads the pair like 'market' does; the merge happens server-side so
  // the carry-forward grid is built once, over both venues, rather than two
  // grids being stitched in the browser.
  const blended = venue === 'all' && canBlendVenues(pairSlug)
  const target = venue === 'dispensers' ? asset : pairSlug
  const path = blended
    ? `/ohlc/${target}?interval=${interval}&limit=${limit}&venue=all`
    : venue === 'dispensers'
      ? `/dispenses/ohlc/${target}?interval=${interval}&limit=${limit}`
      : `/ohlc/${target}?interval=${interval}&limit=${limit}`

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
