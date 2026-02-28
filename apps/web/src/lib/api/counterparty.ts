import { counterpartyUrl } from './client'

/**
 * Build the order book URL for a given market.
 * IMPORTANT: The Counterparty API expects the market in reversed format.
 * e.g. "PEPECASH/XCP" must be sent as "XCP/PEPECASH"
 */
export function ordersUrl(market: string): string {
  const reversedMarket = market.split('/').reverse().join('/')
  return counterpartyUrl(`/orders/${reversedMarket}?status=open&verbose=true`)
}

/**
 * Order matches (completed trades) for a specific market.
 * Same reversal as ordersUrl.
 */
export function orderMatchesUrl(market: string, limit: number = 50): string {
  const reversedMarket = market.split('/').reverse().join('/')
  return counterpartyUrl(`/orders/${reversedMarket}/matches?status=completed&verbose=true&limit=${limit}`)
}

export function holdersUrl(asset: string, limit: number = 30): string {
  return counterpartyUrl(`/assets/${asset}/balances?limit=${limit}&sort=quantity:desc&verbose=true`)
}

// Asset-specific
export function assetDispensersUrl(asset: string, limit: number = 50): string {
  return counterpartyUrl(`/assets/${asset}/dispensers?status=0&verbose=true&limit=${limit}`)
}

export function assetDispensesUrl(asset: string, limit: number = 50): string {
  return counterpartyUrl(`/assets/${asset}/dispenses?verbose=true&limit=${limit}`)
}

// Mempool
export function mempoolDispensesUrl(addresses?: string): string {
  const params = new URLSearchParams({ event_name: 'DISPENSE', verbose: 'true' })
  if (addresses) params.set('addresses', addresses)
  return counterpartyUrl(`/mempool/events?${params.toString()}`)
}

// Global feeds
export function globalOrdersUrl(limit: number = 50): string {
  return counterpartyUrl(`/orders?verbose=true&limit=${limit}&sort=block_index:desc`)
}

export function globalDispensersUrl(limit: number = 50): string {
  return counterpartyUrl(`/dispensers?status=0&verbose=true&limit=${limit}&sort=block_index:desc`)
}

export function globalDispensesUrl(limit: number = 50): string {
  return counterpartyUrl(`/dispenses?verbose=true&limit=${limit}`)
}

export function globalOrderMatchesUrl(limit: number = 50): string {
  return counterpartyUrl(`/order_matches?verbose=true&status=completed&limit=${limit}`)
}
