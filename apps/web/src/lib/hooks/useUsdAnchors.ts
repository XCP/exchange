import { useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'

export interface UsdAnchor {
  /** YYYY-MM-DD, UTC. */
  day: string
  /** XCP in USD that day. */
  xcp: number
  /** BTC in USD that day. */
  btc: number
}

/**
 * Daily USD rates for the two assets everything else is priced through.
 *
 * Returned as a lookup keyed by day, because the caller's job is to price a
 * candle at the rate that applied when it happened — a per-point lookup, not
 * a single multiplier.
 *
 * `rateFor` walks BACKWARD to the most recent known day rather than returning
 * nothing on a miss. The calendar has gaps (and a candle can land on a day the
 * upstream has not published yet), and the last known rate is a far better
 * answer for a chart than a hole in the series.
 */
export function useUsdAnchors(days = 400) {
  const { data, error, isLoading } = useSWR<{ anchors: UsdAnchor[] }>(
    `/api/usd-anchors?days=${days}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000 },
  )

  return useMemo(() => {
    const anchors = data?.anchors ?? []
    const byDay = new Map(anchors.map((a) => [a.day, a]))
    // Ascending, for the backward walk.
    const sortedDays = anchors.map((a) => a.day)

    const rateFor = (unixSeconds: number, unit: 'xcp' | 'btc'): number | null => {
      if (anchors.length === 0) return null
      const day = new Date(unixSeconds * 1000).toISOString().slice(0, 10)
      const exact = byDay.get(day)
      if (exact) return exact[unit]

      // Most recent day at or before the one asked for.
      let best: UsdAnchor | null = null
      for (let i = sortedDays.length - 1; i >= 0; i--) {
        if (sortedDays[i] <= day) {
          best = byDay.get(sortedDays[i]) ?? null
          break
        }
      }
      // Before the calendar starts, the earliest known rate is the only
      // honest answer available.
      return (best ?? anchors[0])[unit]
    }

    return { anchors, rateFor, ready: anchors.length > 0, error, isLoading }
  }, [data, error, isLoading])
}
