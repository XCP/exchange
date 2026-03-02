import { Suspense } from 'react'
import type { Metadata } from 'next'
import { fetchPairStats } from '@/lib/api/server'
import { buildTradePairMetadata } from '@/lib/metadata'
import PairOrdersPage from './page.client'

interface Props {
  params: Promise<{ pair: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair: pairSlug } = await params
  const lastUnderscoreIndex = pairSlug.lastIndexOf('_')
  const base = pairSlug.substring(0, lastUnderscoreIndex)
  const quote = pairSlug.substring(lastUnderscoreIndex + 1)

  const stats = await fetchPairStats(pairSlug)
  const displayBase = stats?.base_asset_longname ?? base

  return buildTradePairMetadata(
    base,
    quote,
    displayBase,
    stats?.best_ask,
    stats?.last_price,
    stats?.price_change_24h,
  )
}

export default function Page({ params }: Props) {
  return <Suspense><PairOrdersPage params={params} /></Suspense>
}
