import useSWR from 'swr'

const MEMPOOL_BASE = 'https://mempool.space/api'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const XCPIO_PRICE_TICKER = 'https://api.xcp.io/v2/price/ticker'

/**
 * Every fetch in this file crosses to a third party we do not operate, and
 * none of them had a deadline. A stalled host is the common failure, not a
 * broken one -- mempool.space/v1/fees/precise was measured at 3,623ms in a
 * normal page load -- and a fetch with no signal waits on the browser default,
 * minutes away, with the UI showing a spinner the whole time.
 *
 * Worse, it made the fallbacks unreachable. xcpPriceFetcher catches a throw to
 * fall back to CoinGecko and useCompose keeps a hardcoded fee rate for when
 * mempool.space is unreachable, but neither runs if the request never settles.
 * A timeout is what converts "slow" into the "failed" case they already
 * handle.
 */
const THIRD_PARTY_TIMEOUT_MS = 8_000

/** Shorter, so a primary that stalls still leaves room for its fallback. */
const PRIMARY_WITH_FALLBACK_TIMEOUT_MS = 5_000

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`)
  return res.json()
}

async function textFetcher(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`)
  return res.text()
}

interface MempoolPrices {
  USD: number
}

/**
 * mempool.space's fee ladder, unrounded.
 *
 * The `/v1/fees/recommended` sibling returns the same shape floored at 1 and
 * rounded to integers, which at today's rates reports 1 for every tier — it
 * cannot express the sub-1 market that actually exists. `precise` reports
 * fastestFee 1.067 and minimumFee 0.1 for the same mempool.
 */
export interface PreciseFees {
  /** Rate to land in the next block. What Auto pays. */
  fastestFee: number
  halfHourFee: number
  hourFee: number
  economyFee: number
  /** The floor the network will still relay at. Read, never hardcoded — it
   *  used to be 1 and is 0.1 today. */
  minimumFee: number
}

export const PRECISE_FEES_URL = 'https://mempool.space/api/v1/fees/precise'

/**
 * The rate a transaction composed right now should pay, from a precise
 * response. Floored by the network's own reported minimum rather than by a
 * constant, so it tracks the relay policy instead of guessing at it.
 */
export function feeRateFrom(fees: PreciseFees | undefined): number | null {
  if (!fees || !Number.isFinite(fees.fastestFee)) return null
  const floor = Number.isFinite(fees.minimumFee) ? fees.minimumFee : 0.1
  const rate = Math.max(fees.fastestFee, floor)
  // Two decimals below 10, whole numbers above: at 0.42 the second digit is a
  // fifth of the fee, at 42 it is noise. Number() drops a trailing zero so
  // 1.10 reads as 1.1.
  return rate < 10 ? Number(rate.toFixed(2)) : Math.round(rate)
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
    const res = await fetch(XCPIO_PRICE_TICKER, {
      signal: AbortSignal.timeout(PRIMARY_WITH_FALLBACK_TIMEOUT_MS),
    })
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
    `${COINGECKO_BASE}/simple/price?ids=counterparty&vs_currencies=btc,usd`,
    { signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS) }
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

/**
 * Next-block fee rate in sat/vB.
 *
 * One SWR key for the whole app, so the header ticker and every form on screen
 * share a single request no matter how many of them ask. That sharing is also
 * what keeps them consistent — a form cannot show a different rate than the
 * header, because there is only one answer in flight. The compose path reads
 * the same URL through feeRateFrom, so what is displayed is what is signed.
 *
 * A minute between polls rather than thirty seconds: the header put this on
 * every page rather than only the form pages, and a next-block estimate does
 * not move meaningfully inside a minute when blocks are ten apart. SWR stops
 * the interval entirely while the tab is hidden, so a parked tab costs nothing.
 */
export function useFeeRate() {
  const { data } = useSWR<PreciseFees>(
    PRECISE_FEES_URL,
    jsonFetcher,
    { refreshInterval: 60_000, dedupingInterval: 30_000 }
  )
  return feeRateFrom(data)
}
