import { useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { useBtcPrice, useXcpPrice } from '@/lib/hooks/useNetworkInfo'

export interface PriceRow {
  day: string
  /** XCP in USD. */
  xcp: number
  /** BTC in USD. */
  btc: number
  /** XCP in circulation. Null on days the calendar has no figure. */
  supply: number | null
}

export interface Peak {
  day: string
  value: number
}

interface Response {
  anchors: PriceRow[]
  /** Computed over the full calendar server-side, whatever window was asked for. */
  stats: {
    supply: number | null
    ath: { btc: Peak | null; xcp: Peak | null; ratio: Peak | null }
  } | null
}

/**
 * The daily USD calendar, for whichever depth the view needs.
 *
 * Two tiers rather than one per window, so there are at most two cached
 * payloads and the shallow one is the SAME key lib/hooks/useUsdAnchors
 * already uses — a visitor who lands on an asset page and then /price shares
 * one fetch instead of making two overlapping ones.
 *
 * `keepPreviousData` matters here: switching to a deeper window changes the
 * key, and without it the chart would blank while the new payload arrives.
 *
 * Records (all-time highs) do NOT come from these rows. They cannot be
 * derived from a slice, and having the client derive them is what forced the
 * full 60 KB history on every visitor; the server sends them alongside.
 */
export function usePriceHistory(deep: boolean) {
  const { data, error, isLoading } = useSWR<Response>(
    `/api/usd-anchors?days=${deep ? 5000 : SHALLOW_DAYS}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000, keepPreviousData: true },
  )
  const { xcpUsd } = useXcpPrice()
  const btcUsd = useBtcPrice()
  const rows = useMemo(() => {
    const historical = data?.anchors ?? []
    if (historical.length === 0 || xcpUsd == null || btcUsd == null) return historical
    const today = new Date().toISOString().slice(0, 10)
    const last = historical.at(-1)!
    const live = { day: today, xcp: xcpUsd, btc: btcUsd, supply: last.supply }
    return last.day === today ? [...historical.slice(0, -1), live] : [...historical, live]
  }, [data?.anchors, xcpUsd, btcUsd])
  const stats = useMemo(() => {
    if (!data?.stats || rows.length === 0) return data?.stats ?? null
    const today = rows.at(-1)!
    const peak = (current: Peak | null, value: number): Peak =>
      !current || value > current.value ? { day: today.day, value } : current
    return {
      ...data.stats,
      ath: {
        btc: peak(data.stats.ath.btc, today.btc),
        xcp: peak(data.stats.ath.xcp, today.xcp),
        ratio: peak(data.stats.ath.ratio, (today.xcp / today.btc) * 1e8),
      },
    }
  }, [data, rows])
  return {
    rows,
    stats,
    error,
    isLoading,
  }
}

/** Matches useUsdAnchors' default so the two share a cache entry. */
const SHALLOW_DAYS = 400

/**
 * Bitcoin in circulation at a given height, from the emission schedule.
 *
 * Derived rather than fetched: it is a pure function of block height that no
 * API is needed to answer, and we already track the tip. Integer satoshis
 * throughout because the subsidy halves by integer division — floating point
 * would drift a few satoshis per epoch and the total is the point.
 *
 * Counts issued coins, not spendable ones. Provably burned and lost outputs
 * are still included, which is the same convention every market-cap figure
 * for bitcoin uses.
 */
export function bitcoinSupply(height: number): number {
  if (!Number.isFinite(height) || height < 0) return 0
  const HALVING = 210_000
  let sats = 0
  let subsidy = 50 * 1e8
  let remaining = height + 1
  while (remaining > 0 && subsidy > 0) {
    const blocks = Math.min(remaining, HALVING)
    sats += blocks * subsidy
    remaining -= blocks
    subsidy = Math.floor(subsidy / 2)
  }
  return sats / 1e8
}
