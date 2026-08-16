import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { ordersUrl } from '@/lib/api/counterparty'
import {
  getTradingDirection,
  calculatePricePlain,
  calculatePrice,
  calculateAmount,
  calculateTotal,
} from '@/utils/trading-pair'
import type { Order, OrderBookEntry } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'
import { num } from '@/utils/numeric'

interface OrderBookData {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread: string
  spreadPct: string
  rawBids: Order[]
  rawAsks: Order[]
}

function processOrders(orders: Order[]): OrderBookData {
  const buyOrders = orders.filter(order => getTradingDirection(order) === 'buy')
  const sellOrders = orders.filter(order => getTradingDirection(order) === 'sell')

  // Sort buys high to low, sells low to high
  buyOrders.sort((a, b) => num(calculatePricePlain(b)) - num(calculatePricePlain(a)))
  sellOrders.sort((a, b) => num(calculatePricePlain(a)) - num(calculatePricePlain(b)))

  const bids: OrderBookEntry[] = buyOrders.map(order => ({
    price: calculatePrice(order),
    amount: calculateAmount(order),
    total: calculateTotal(order),
  }))

  const asks: OrderBookEntry[] = sellOrders.map(order => ({
    price: calculatePrice(order),
    amount: calculateAmount(order),
    total: calculateTotal(order),
  }))

  // Calculate spread
  const bestBid = buyOrders.length > 0 ? num(calculatePricePlain(buyOrders[0])) : 0
  const bestAsk = sellOrders.length > 0 ? num(calculatePricePlain(sellOrders[0])) : 0
  const spread = bestBid > 0 && bestAsk > 0 ? (bestAsk - bestBid).toFixed(8) : '0.00000000'
  const spreadPct = bestBid > 0 && bestAsk > 0
    ? (((bestAsk - bestBid) / bestBid) * 100).toFixed(2)
    : '0.00'

  return { bids, asks, spread, spreadPct, rawBids: buyOrders, rawAsks: sellOrders }
}

export function useOrderBook(market: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Order[]>>(
    market ? ordersUrl(market) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  const processed = data?.result ? processOrders(data.result) : null

  return {
    bids: processed?.bids ?? [],
    asks: processed?.asks ?? [],
    spread: processed?.spread ?? '0.00000000',
    spreadPct: processed?.spreadPct ?? '0.00',
    rawBids: processed?.rawBids ?? [],
    rawAsks: processed?.rawAsks ?? [],
    error,
    isLoading,
  }
}
