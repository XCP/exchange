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

function ogFields(title: string, description: string, path?: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      title,
      description,
      ...(path ? { url: path } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export function buildTradePairMetadata(
  base: string,
  quote: string,
  displayBase: string,
  bestAsk: number | null | undefined,
  lastPrice: number | null | undefined,
  change: number | null | undefined,
  description?: string | null,
): Metadata {
  const price = bestAsk ?? lastPrice
  const priceStr = formatPrice(price)
  const changeStr = formatChange(change)

  const title = priceStr
    ? `${displayBase} ${priceStr} ${quote}${changeStr}`
    : `${displayBase}/${quote}`

  const desc = description ?? `Trade ${displayBase}/${quote} on the Counterparty DEX. ${priceStr ? `Price: ${priceStr} ${quote}${changeStr}.` : ''} No counterparty risk.`

  return {
    title,
    description: desc,
    ...ogFields(title, desc, `/trade/${base}_${quote}`),
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
    ...ogFields(title, desc, `/dispense/${asset}`),
  }
}

export function buildAssetMetadata(
  asset: string,
  displayAsset: string,
  description?: string | null,
  supply?: string | null,
  locked?: boolean | null,
): Metadata {
  const title = displayAsset
  const parts: string[] = [`${displayAsset} on the Counterparty network.`]
  if (supply) parts.push(`Supply: ${supply}.`)
  if (locked) parts.push('Locked.')
  const desc = description && !description.includes('.json') ? description : parts.join(' ')

  return {
    title,
    description: desc,
    ...ogFields(title, desc, `/${asset}`),
  }
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
