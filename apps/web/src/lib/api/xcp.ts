import { xcpUrl } from './client'

export function tradingPairsUrl(market: string): string {
  return xcpUrl(`/trading-pairs/${market}`)
}

export function tradingPairUrl(pairSlug: string): string {
  return xcpUrl(`/trading-pair/${pairSlug}`)
}

export function tradesUrl(pairSlug: string, page: number = 1): string {
  return xcpUrl(`/trading-pair/${pairSlug}/trades?page=${page}`)
}

export function ohlcUrl(pairSlug: string, interval: string = '1d'): string {
  return xcpUrl(`/ohlc/${pairSlug}?interval=${interval}`)
}

export function trendingUrl(): string {
  return xcpUrl('/trading-pair/trending')
}
