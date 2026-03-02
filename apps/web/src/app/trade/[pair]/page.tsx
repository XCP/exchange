import { Suspense } from 'react'
import type { Metadata } from 'next'
import { fetchPairStats } from '@/lib/api/server'
import { buildTradePairMetadata } from '@/lib/metadata'
import { XCP_IMG_BASE } from '@/utils/constants'
import PairOrdersPage from './page.client'

interface Props {
  params: Promise<{ pair: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pair: pairSlug } = await params
  const sp = await searchParams
  const lastUnderscoreIndex = pairSlug.lastIndexOf('_')
  const base = pairSlug.substring(0, lastUnderscoreIndex)
  const quote = pairSlug.substring(lastUnderscoreIndex + 1)

  const stats = await fetchPairStats(pairSlug)
  const displayBase = stats?.base_asset_longname ?? base

  const meta = buildTradePairMetadata(
    base,
    quote,
    displayBase,
    stats?.best_ask,
    stats?.last_price,
    stats?.price_change_24h,
  )

  const icons = { icon: `${XCP_IMG_BASE}/icon/${quote}` }

  const hasTradeParams = sp.side || sp.price || sp.amount
  if (hasTradeParams) {
    return {
      ...meta,
      icons,
      alternates: { canonical: `/trade/${pairSlug}` },
      robots: { index: false, follow: false },
    }
  }

  return { ...meta, icons }
}

export default function Page({ params }: Props) {
  return <Suspense><PairOrdersPage params={params} /></Suspense>
}
