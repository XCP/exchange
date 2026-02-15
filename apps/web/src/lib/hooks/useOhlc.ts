import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

interface OhlcCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
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
}

export function useOhlc(pairSlug: string, timeframe: string = '1D', limit: number = 300) {
  const interval = INTERVAL_MAP[timeframe] ?? '1d'
  const url = pairSlug
    ? dexUrl(`/ohlc/${pairSlug}?interval=${interval}&limit=${limit}`)
    : null

  const { data, error, isLoading } = useSWR<OhlcResponse>(
    url,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  )

  return {
    candles: data?.candles ?? [],
    error,
    isLoading,
  }
}
