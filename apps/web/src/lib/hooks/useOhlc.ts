import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { ohlcUrl } from '@/lib/api/xcp'
import type { OHLCCandle } from '@/types/trading'

interface RawOHLCResponse {
  data: {
    timestamp: number
    ohlc_data: {
      open: string
      high: string
      low: string
      close: string
      volume?: string
    }[]
  }[]
}

const INTERVAL_MAP: Record<string, string> = {
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1m',
}

export function useOHLC(pairSlug: string, interval: string = '1D') {
  const apiInterval = INTERVAL_MAP[interval] ?? interval
  const { data, error, isLoading } = useSWR<RawOHLCResponse>(
    pairSlug ? ohlcUrl(pairSlug, apiInterval) : null,
    fetcher,
    { refreshInterval: 60_000 }
  )

  // Transform API shape → flat OHLCCandle[], skip empty periods
  const candles: OHLCCandle[] = (data?.data ?? [])
    .filter((d) => d.ohlc_data && d.ohlc_data.length > 0)
    .map((d) => {
      const c = d.ohlc_data[0]
      return {
        timestamp: d.timestamp,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume ?? '0'),
      }
    })

  return { candles, error, isLoading }
}
