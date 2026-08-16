import type { Metadata } from 'next'

const DEFAULT_DESCRIPTION = 'Peer-to-peer trading on the Counterparty Decentralized Exchange. No counterparty risk.'

function formatChange(change: number | null | undefined): string {
  if (change == null || change === 0) return ''
  return ` (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return ''
  if (price >= 1) return price.toLocaleString('en-US', { maximumFractionDigits: 4 })
  // Small numbers: show significant digits
  return price.toPrecision(4).replace(/\.?0+$/, '')
}

function ogFields(
  title: string,
  description: string,
  path?: string,
  image?: string,
): Pick<Metadata, 'openGraph' | 'twitter' | 'alternates'> {
  return {
    /**
     * `path` was feeding og:url and nothing else, so the site emitted no
     * canonical at all. Every caller already passes the page's one true path,
     * which is exactly what a canonical is — /liquidity/deposit and
     * /liquidity/withdrawal are the case that made the omission visible, but
     * it applied everywhere.
     *
     * Relative on purpose: metadataBase in app/layout resolves it, so the
     * host lives in one place instead of in every call site.
     */
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      title,
      description,
      ...(path ? { url: path } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export function buildDispenseMetadata(
  asset: string,
  displayAsset: string,
  cheapestPrice: number | null | undefined,
  lastPrice: number | null | undefined,
  change: number | null | undefined,
  activeCount: number | null | undefined,
  description?: string | null,
): Metadata {
  const price = cheapestPrice ?? lastPrice
  const priceStr = formatPrice(price)
  const changeStr = formatChange(change)

  const title = priceStr
    ? `${displayAsset} ${priceStr} BTC${changeStr}`
    : `${displayAsset} Dispensers`

  const desc = description ?? `Buy ${displayAsset} from ${activeCount ?? 0} active dispensers on the Counterparty network.${priceStr ? ` Best price: ${priceStr} BTC.` : ''}`

  return {
    title,
    description: desc,
    ...ogFields(title, desc, `/buy/${asset}`),
  }
}

/**
 * An asset page.
 *
 * The description is a FACT LINE — price, movement, where it can be bought —
 * because these links are shared far more than they are searched, and a card
 * has one job: tell someone what they are looking at. It used to read
 * "PEPECASH on the Counterparty network. Supply: 995,273,182.8," which is true
 * of every asset and interesting about none.
 *
 * The asset's own on-chain description is deliberately NOT used. It is
 * frequently a URL, a JSON blob, or marketing from the issuer, and none of
 * those survive being pasted into a chat window.
 *
 * Falls back to supply for an asset that has never traded and has no
 * dispensers — there, supply genuinely is the only fact available.
 */
export function buildAssetMetadata(
  asset: string,
  displayAsset: string,
  opts: {
    /** Last price in XCP, from the asset's XCP market. */
    price?: number | null
    change24h?: number | null
    dispensers?: number | null
    supply?: string | null
    locked?: boolean | null
  } = {},
): Metadata {
  const { price, change24h, dispensers, supply, locked } = opts
  const priceStr = formatPrice(price)
  // The number belongs in the TITLE: it is what a tab, a search result and a
  // share preview all show first.
  const title = priceStr ? `${displayAsset} · ${priceStr} XCP` : displayAsset

  const facts: string[] = []
  if (priceStr) facts.push(`${priceStr} XCP${formatChange(change24h)}`)
  if (dispensers && dispensers > 0) {
    facts.push(`${dispensers.toLocaleString()} dispenser${dispensers === 1 ? '' : 's'}`)
  }
  if (facts.length === 0 && supply) facts.push(`Supply ${supply}${locked ? ' · locked' : ''}`)
  const desc = facts.length > 0 ? facts.join(' · ') : `${displayAsset} on Counterparty`

  return { title, description: desc, ...ogFields(title, desc, `/${asset}`, `https://cdn.xcp.io/img/full/${asset}`) }
}

/**
 * A liquidity pool.
 *
 * The description is a FACT LINE, not a sentence. These pages are shared far
 * more than they are searched, and a share card has one job: say what this is
 * and how big it is. "Peer-to-peer trading on the Counterparty Decentralized
 * Exchange" — which is what every pool page said before this existed, having
 * no metadata of its own — tells a reader nothing about the pool they were
 * sent.
 */
export function buildPoolMetadata(
  lpAsset: string,
  pair: string,
  assetA: string,
  assetB: string,
  reserveA: number,
  reserveB: number,
  matches: number,
): Metadata {
  const title = `${pair.replace('_', ' / ')} pool`
  const desc = [
    `${formatPrice(reserveA)} ${assetA} · ${formatPrice(reserveB)} ${assetB}`,
    matches > 0 ? `${matches.toLocaleString()} swap${matches === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  // The base asset's own artwork — the same image its /ASSET page shares.
  return { title, description: desc, ...ogFields(title, desc, `/pool/${lpAsset}`, `https://cdn.xcp.io/img/full/${assetA}`) }
}

export function buildStaticMetadata(pageTitle: string, description?: string, path?: string): Metadata {
  const title = pageTitle
  const desc = description ?? DEFAULT_DESCRIPTION

  return {
    title,
    description: desc,
    ...ogFields(title, desc, path),
  }
}
