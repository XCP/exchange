import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export interface OhlcCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
  n: number // trade count (0 = gap-filled)
}

interface OhlcResponse {
  pair: string
  interval: string
  candles: OhlcCandle[]
}

// Map UI timeframe labels to API interval params
const INTERVAL_MAP: Record<string, string> = {
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1m',
  '1Y': '1y',
}

const BATCH_SIZE = 300

export function useOhlc(pairSlug: string, timeframe: string = '1D') {
  const interval = INTERVAL_MAP[timeframe] ?? '1d'
  const url = pairSlug
    ? dexUrl(`/ohlc/${pairSlug}?interval=${interval}&limit=${BATCH_SIZE}`)
    : null

  // SWR for the latest candles (auto-refreshes)
  const { data, error, isLoading } = useSWR<OhlcResponse>(
    url,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  )

  // Accumulated historical candles (prepended via loadMore)
  const [historicalCandles, setHistoricalCandles] = useState<OhlcCandle[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Reset history when pair or timeframe changes
  const prevKey = useRef('')
  useEffect(() => {
    const key = `${pairSlug}:${timeframe}`
    if (key !== prevKey.current) {
      prevKey.current = key
      setHistoricalCandles([])
      setHasMore(true)
    }
  }, [pairSlug, timeframe])

  // Stable reference — only recalculate when SWR data object changes
  const latestCandles = useMemo(() => data?.candles ?? [], [data])

  // Merge: historical (older) + SWR data (newer), deduplicate by timestamp
  const merged = useMemo(
    () => mergeCandles(historicalCandles, latestCandles),
    [historicalCandles, latestCandles]
  )

  // Count candles with actual trades (not gap-filled)
  const realCandleCount = useMemo(
    () => merged.filter((c) => c.n > 0).length,
    [merged]
  )

  // Use refs for values needed inside loadMore to avoid dep churn
  const stateRef = useRef({ pairSlug, interval, historicalCandles, latestCandles })
  stateRef.current = { pairSlug, interval, historicalCandles, latestCandles }

  // Load older candles on demand — stable callback via refs
  const loadMore = useCallback(async () => {
    if (!stateRef.current.pairSlug || loadingMore || !hasMore) return

    const { pairSlug: pair, interval: intv, historicalCandles: hist, latestCandles: latest } = stateRef.current
    const allCandles = mergeCandles(hist, latest)
    if (allCandles.length === 0) return

    const oldestTimestamp = allCandles[0].t
    setLoadingMore(true)

    try {
      const moreUrl = dexUrl(
        `/ohlc/${pair}?interval=${intv}&limit=${BATCH_SIZE}&to=${oldestTimestamp - 1}`
      )
      const resp: OhlcResponse = await fetcher(moreUrl)

      if (!resp.candles.length) {
        setHasMore(false)
      } else {
        setHistoricalCandles((prev) => mergeCandles(resp.candles, prev))
        // If we got fewer real candles than requested, we've reached the beginning
        const realCount = resp.candles.filter((c) => c.n > 0).length
        if (realCount < BATCH_SIZE) {
          setHasMore(false)
        }
      }
    } catch (e) {
      console.error('Failed to load more candles:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore])

  return {
    candles: merged,
    realCandleCount,
    error,
    isLoading,
    loadMore,
    loadingMore,
    hasMore,
  }
}

/** Merge two sorted candle arrays, deduplicate by timestamp */
function mergeCandles(older: OhlcCandle[], newer: OhlcCandle[]): OhlcCandle[] {
  if (!older.length) return newer
  if (!newer.length) return older

  const seen = new Set<number>()
  const result: OhlcCandle[] = []

  for (const c of older) {
    if (!seen.has(c.t)) {
      seen.add(c.t)
      result.push(c)
    }
  }
  for (const c of newer) {
    if (!seen.has(c.t)) {
      seen.add(c.t)
      result.push(c)
    }
  }

  result.sort((a, b) => a.t - b.t)
  return result
}
