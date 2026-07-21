import useSWR from 'swr'

const MEMPOOL_BASE = 'https://mempool.space/api'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const XCPIO_PRICE_TICKER = 'https://api.xcp.io/v2/price/ticker'

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

interface XcpIoPriceTicker {
  result: {
    xcp: { usd: number } | null
    btc: { usd: number } | null
  }
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

async function xcpPriceFetcher(): Promise<{ btc: number; usd: number }> {
  try {
    const res = await fetch(XCPIO_PRICE_TICKER)
    if (res.ok) {
      const data: XcpIoPriceTicker = await res.json()
      const xcpUsd = data.result.xcp?.usd
      const btcUsd = data.result.btc?.usd
      if (
        Number.isFinite(xcpUsd) &&
        Number.isFinite(btcUsd) &&
        xcpUsd != null &&
        btcUsd != null &&
        xcpUsd > 0 &&
        btcUsd > 0
      ) {
        return { btc: xcpUsd / btcUsd, usd: xcpUsd }
      }
    }
  } catch {}
  // Fallback to CoinGecko
  const res = await fetch(
    `${COINGECKO_BASE}/simple/price?ids=counterparty&vs_currencies=btc,usd`
  )
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`)
  const data: CoinGeckoXcp = await res.json()
  return { btc: data.counterparty.btc, usd: data.counterparty.usd }
}

/** XCP price (BTC and USD) — xcp.io primary, CoinGecko fallback */
export function useXcpPrice() {
  const { data } = useSWR('xcp-price', xcpPriceFetcher, {
    refreshInterval: 120_000,
    dedupingInterval: 60_000,
  })
  return {
    xcpBtc: data?.btc ?? null,
    xcpUsd: data?.usd ?? null,
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

/** Next-block fee rate in sat/vB (median, no buffer), rounded to nearest integer */
export function useFeeRate() {
  const { data } = useSWR<MempoolBlock[]>(
    `${MEMPOOL_BASE}/v1/fees/mempool-blocks`,
    jsonFetcher,
    { refreshInterval: 30_000, dedupingInterval: 15_000 }
  )

  if (!data || data.length === 0) return null
  const fee = data[0].medianFee
  if (fee < 1) return parseFloat(fee.toFixed(2))
  return Math.round(fee)
}
