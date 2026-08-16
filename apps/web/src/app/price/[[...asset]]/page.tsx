import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { buildStaticMetadata } from '@/lib/metadata'
import { fetchCoinPrices } from '@/lib/api/server'
import PriceClient from './page.client'

/**
 * /price, /price/BTC and /price/XCP are one page with a tab preselected —
 * the same shape /swap uses. Only these two assets have a page here: every
 * other one is priced in a market of its own and lives at /ASSET.
 */
const COINS = ['BTC', 'XCP'] as const
type Coin = (typeof COINS)[number]

interface Props {
  params: Promise<{ asset?: string[] }>
}

const usd = (v: number | null | undefined) =>
  v == null ? null : `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 2 : 0 })}`

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const coin = readCoin((await params).asset)
  const prices = await fetchCoinPrices()

  /**
   * A fact line, not a sentence. "XCP price history in USD, market cap and
   * circulating supply" describes the PAGE; "$1.54 · $3.88M cap" describes the
   * thing, which is what someone pasting the link is actually sharing.
   */
  const cap = prices?.xcp != null && prices.supply ? prices.xcp * prices.supply : null
  const facts =
    coin === 'XCP'
      ? [usd(prices?.xcp), cap ? `$${(cap / 1e6).toFixed(2)}M cap` : null]
      : coin === 'BTC'
        ? [usd(prices?.btc)]
        : [prices?.xcp != null ? `XCP ${usd(prices.xcp)}` : null, prices?.btc != null ? `BTC ${usd(prices.btc)}` : null]
  const line = facts.filter(Boolean).join(' · ')

  const meta = buildStaticMetadata(
    coin ? `${coin} Price and Market Cap` : 'BTC and XCP Price History',
    line || undefined,
    '/price',
  )
  // The segment picks a tab and adds no content of its own, so both spellings
  // consolidate onto /price rather than competing with it.
  return { ...meta, alternates: { canonical: '/price' } }
}

function readCoin(segments: string[] | undefined): Coin | null {
  const first = segments?.[0]
  if (!first) return null
  const upper = decodeURIComponent(first).toUpperCase()
  return (COINS as readonly string[]).includes(upper) ? (upper as Coin) : null
}

export default async function Page({ params }: Props) {
  const segments = (await params).asset
  const coin = readCoin(segments)
  // A segment that names neither coin is not a price page — /price/DOGE has
  // no meaning here, and the bare page is the honest destination.
  if (segments && segments.length > 0 && !coin) permanentRedirect('/price')
  return <PriceClient initial={coin ?? 'RATIO'} />
}
