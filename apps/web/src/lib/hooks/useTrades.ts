import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetcher, dexUrl } from '@/lib/api/client'
import { useDexSWR } from '@/lib/api/use-dex-swr'

export interface Trade {
  id: number
  price: number
  amount: number
  volume: number
  side: 'buy' | 'sell'
  maker: string
  taker: string
  block_time: number
  tx0: string
  tx1: string
}

interface DexTrade {
  id: number
  t: number
  price: number
  amount: number
  volume: number
  side: string
  maker: string
  taker: string
  tx0: string
  tx1: string
}

interface TradesResponse {
  pair: string
  trades: DexTrade[]
  next_cursor: string | null
}

const PAGE_SIZE = 50
const MAX_TRADES = 1000

function mapTrade(t: DexTrade): Trade {
  return {
    id: t.id,
    price: t.price,
    amount: t.amount,
    volume: t.volume,
    side: t.side as 'buy' | 'sell',
    maker: t.maker,
    taker: t.taker,
    block_time: t.t,
    tx0: t.tx0,
    tx1: t.tx1,
  }
}

export function useTrades(market: string, baseSymbol: string, quoteSymbol: string) {
  const pairSlug = market.replace('/', '_')
  const url = market ? dexUrl(`/trades/${pairSlug}?limit=${PAGE_SIZE}`) : null

  // SWR fetches the latest page (auto-refreshes)
  const { data, error, isLoading } = useDexSWR<TradesResponse>(
    url,
    { revalidateOnFocus: false }
  )

  // Accumulated older trades (appended via loadMore)
  const [olderTrades, setOlderTrades] = useState<Trade[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  // Reset when pair changes
  const prevPair = useRef('')
  useEffect(() => {
    if (pairSlug !== prevPair.current) {
      prevPair.current = pairSlug
      setOlderTrades([])
      setNextCursor(null)
      setHasMore(true)
    }
  }, [pairSlug])

  // Track the cursor from the initial SWR response
  useEffect(() => {
    if (data) {
      setNextCursor(data.next_cursor)
      if (!data.next_cursor) setHasMore(false)
    }
  }, [data])

  // Map latest trades from SWR
  const latestTrades = useMemo(
    () => (data?.trades ?? []).map(mapTrade),
    [data]
  )

  // Merge: latest (newest) + older, deduplicate by id (fall back to tx0+tx1)
  const trades = useMemo(() => {
    if (!olderTrades.length) return latestTrades
    const seen = new Set<string>()
    const key = (t: Trade) => t.id != null ? String(t.id) : `${t.tx0}-${t.tx1}`
    const result: Trade[] = []
    for (const t of latestTrades) {
      const k = key(t)
      if (!seen.has(k)) { seen.add(k); result.push(t) }
    }
    for (const t of olderTrades) {
      const k = key(t)
      if (!seen.has(k)) { seen.add(k); result.push(t) }
    }
    return result
  }, [latestTrades, olderTrades])

  // Stable refs for the loadMore callback
  const stateRef = useRef({ pairSlug, nextCursor, olderTrades, latestTrades })
  stateRef.current = { pairSlug, nextCursor, olderTrades, latestTrades }

  const loadMore = useCallback(async () => {
    const { pairSlug: pair, nextCursor: cursor } = stateRef.current
    if (!pair || !cursor || loadingMore || !hasMore) return

    // Cap total trades
    const totalSoFar = stateRef.current.latestTrades.length + stateRef.current.olderTrades.length
    if (totalSoFar >= MAX_TRADES) {
      setHasMore(false)
      return
    }

    setLoadingMore(true)
    try {
      const moreUrl = dexUrl(`/trades/${pair}?limit=${PAGE_SIZE}&cursor=${cursor}`)
      const resp: TradesResponse = await fetcher(moreUrl)

      if (!resp.trades.length) {
        setHasMore(false)
        setNextCursor(null)
      } else {
        const newTrades = resp.trades.map(mapTrade)
        setOlderTrades((prev) => [...prev, ...newTrades])
        setNextCursor(resp.next_cursor)
        if (!resp.next_cursor) setHasMore(false)
      }
    } catch (e) {
      console.error('Failed to load more trades:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore])

  return {
    trades,
    error,
    isLoading,
    loadMore,
    loadingMore,
    hasMore,
  }
}
