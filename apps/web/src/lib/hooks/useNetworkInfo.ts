import useSWR from 'swr'

const MEMPOOL_BASE = 'https://mempool.space/api'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`)
  return res.json()
}

async function textFetcher(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`)
  return res.text()
}

interface MempoolPrices {
  USD: number
}

interface MempoolBlock {
  medianFee: number
  feeRange: number[]
}

interface CoinGeckoXcp {
  counterparty: { btc: number; usd: number }
}

/** BTC/USD price — globally cached via SWR key */
export function useBtcPrice() {
  const { data } = useSWR<MempoolPrices>(
    `${MEMPOOL_BASE}/v1/prices`,
    jsonFetcher,
    { refreshInterval: 60_000, dedupingInterval: 30_000 }
  )
  return data?.USD ?? null
}

/** XCP price (BTC and USD) — globally cached via SWR key */
export function useXcpPrice() {
  const { data } = useSWR<CoinGeckoXcp>(
    `${COINGECKO_BASE}/simple/price?ids=counterparty&vs_currencies=btc,usd`,
    jsonFetcher,
    { refreshInterval: 120_000, dedupingInterval: 60_000 }
  )
  return {
    xcpBtc: data?.counterparty?.btc ?? null,
    xcpUsd: data?.counterparty?.usd ?? null,
  }
}

/** Latest block height — globally cached via SWR key */
export function useBlockHeight() {
  const { data } = useSWR<string>(
    `${MEMPOOL_BASE}/blocks/tip/height`,
    textFetcher,
    { refreshInterval: 30_000, dedupingInterval: 15_000 }
  )
  return data ? parseInt(data, 10) : null
}

/** Next-block fee rate in sat/vB with 20% buffer, rounded to 2 decimals */
export function useFeeRate() {
  const { data } = useSWR<MempoolBlock[]>(
    `${MEMPOOL_BASE}/v1/fees/mempool-blocks`,
    jsonFetcher,
    { refreshInterval: 30_000, dedupingInterval: 15_000 }
  )

  if (!data || data.length === 0) return null
  const median = data[0].medianFee
  return Math.round(median * 1.2 * 100) / 100
}
