import { NextResponse } from 'next/server'

/**
 * Daily XCP/USD and BTC/USD, for pricing history in dollars.
 *
 * Charting an XCP-denominated series in USD needs the rate that applied on
 * each DAY, not today's. Multiplying a whole series by the current rate
 * produces a curve identical in shape and wrong in dollars at every point but
 * the last — which looks convincing and says nothing.
 *
 * Two anchors cover the whole site: anything with an XCP market prices through
 * XCP/USD, and the dispenser venue through BTC/USD. No per-asset feed is
 * needed, because we already hold each asset's price in XCP or BTC.
 *
 * xcp-explorer maintains this calendar — daily back to 2014, with a documented
 * source per row — and publishes it at the URL below. It is proxied here
 * rather than fetched from the browser because the upstream payload is a few
 * hundred KB of history a chart never needs, and this trims it to the days
 * asked for behind a shared server-side cache.
 */
const UPSTREAM = 'https://api.xcp.io/v2/price'
/**
 * The upstream calendar runs daily from 2014, ~4,600 rows. Callers ask for the
 * window they actually draw — the whole thing is 60 KB gzipped and the default
 * view needs 6 KB of it.
 */
const MAX_DAYS = 5000

interface UpstreamRow {
  day: string
  /** XCP in USD. */
  usd: number
  /** BTC in USD on the same day. */
  btc: number
  /** XCP in circulation that day — what a market cap needs. */
  supply?: number
}

export async function GET(request: Request) {
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number(new URL(request.url).searchParams.get('days') ?? 400) || 400),
  )

  try {
    // Same reason as fetchCoinPrices: the revalidate hint routes this through
    // the R2-backed data cache, which held a three-day-old copy of this exact
    // URL. This route sets its OWN cache-control below (300s browser / 900s
    // edge), so freshness is still bounded here — it just isn't bounded by a
    // store that stops revalidating.
    const res = await fetch(UPSTREAM, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ anchors: [], stats: null })

    const data = (await res.json()) as {
      result?: {
        history?: UpstreamRow[]
        xcp?: { usd?: number; day?: string }
        btc?: { usd?: number }
      }
    }
    const history = data.result?.history ?? []

    const full = history
      .map((r) => ({ day: r.day, xcp: r.usd, btc: r.btc, supply: r.supply ?? null }))
      .filter((r) => r.day && r.xcp > 0 && r.btc > 0)

    // Today is often not in the calendar yet; the live ticker is the better
    // reading for it than yesterday's close.
    const latest = data.result?.xcp
    const latestBtc = data.result?.btc?.usd
    if (latest?.day && latest.usd && latest.usd > 0 && full.at(-1)?.day !== latest.day) {
      full.push({
        day: latest.day,
        xcp: latest.usd,
        btc: latestBtc && latestBtc > 0 ? latestBtc : (full.at(-1)?.btc ?? 0),
        // Today has no settled supply figure; yesterday's is the closest true
        // one and issuance is far too slow for the difference to show.
        supply: full.at(-1)?.supply ?? null,
      })
    }

    /**
     * Records computed over the WHOLE calendar, then sent alongside whatever
     * window was asked for.
     *
     * An all-time high cannot be derived from a slice — the client used to do
     * it, which forced every visitor to download twelve years to draw one. Run
     * here it costs one pass per revalidation (every 15 minutes) instead of
     * one per visitor, and the window shrinks to what is actually plotted.
     */
    const peak = (of: (r: (typeof full)[number]) => number) => {
      let best: { day: string; value: number } | null = null
      for (const r of full) {
        const value = of(r)
        if (value > 0 && (!best || value > best.value)) best = { day: r.day, value }
      }
      return best
    }
    const stats = {
      /** Latest settled XCP supply, for a market cap. */
      supply: full.at(-1)?.supply ?? null,
      ath: {
        btc: peak((r) => r.btc),
        xcp: peak((r) => r.xcp),
        // XCP priced in bitcoin, in satoshis — the ratio view's own record.
        ratio: peak((r) => (r.btc > 0 ? (r.xcp / r.btc) * 1e8 : 0)),
      },
    }

    const anchors = full.slice(-days)

    return NextResponse.json(
      { anchors, stats },
      { headers: { 'cache-control': 'public, max-age=300, s-maxage=900' } },
    )
  } catch {
    // A chart that cannot price in dollars should fall back to its own quote
    // asset, not error the page.
    return NextResponse.json({ anchors: [], stats: null })
  }
}
