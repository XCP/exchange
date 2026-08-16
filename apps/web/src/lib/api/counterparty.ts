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
/**
 * Buyable dispensers for an asset, cheapest first.
 *
 * `exclude_with_oracle` is the API's own filter and is better than warning
 * about them after the fact: an oracle dispenser settles at whatever the
 * oracle says when the payment confirms, so no fixed payout can be quoted and
 * there is nothing useful to show in a buy list. (The address-level check in
 * useAddressDispensers still looks at oracle dispensers, because core pays
 * from them regardless of what this list shows.)
 *
 * Deliberately NOT filtered by lot size. Launchpad keeps only
 * give_quantity === 1e8 because it sells one asset and can guarantee a clean
 * integer list; across every Counterparty asset that rule would hide the only
 * dispensers for ~4% of assets. The lot constraint is handled in the form
 * instead, which rounds down to a whole lot and says so.
 */
export function assetDispensersUrl(asset: string, limit: number = 50): string {
  return counterpartyUrl(
    `/assets/${asset}/dispensers?status=open&exclude_with_oracle=true&sort=price:asc&verbose=true&limit=${limit}`,
  )
}

export function assetDispensesUrl(asset: string, limit: number = 50): string {
  return counterpartyUrl(`/assets/${asset}/dispenses?verbose=true&limit=${limit}`)
}

// Mempool reads deliberately do NOT live here any more. They moved behind
// api.xcpdex.com/mempool: a hook that polls a third-party API runs once per
// OPEN TAB, so at a 15s interval a thousand tabs was ~66 req/s aimed at
// someone else's public node, scaling with our traffic and buying us nothing.
// Behind our own edge-cached endpoint it is ~one upstream call per colo per
// TTL. See lib/hooks/useMempool.ts and apps/api/src/routes/mempool.ts.

// Global feeds
export function globalDispensersUrl(limit: number = 50): string {
  return counterpartyUrl(`/dispensers?status=0&verbose=true&limit=${limit}&sort=block_index:desc`)
}

export function globalDispensesUrl(limit: number = 50): string {
  return counterpartyUrl(`/dispenses?verbose=true&limit=${limit}`)
}

