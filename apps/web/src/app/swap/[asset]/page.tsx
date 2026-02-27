import type { Metadata } from 'next'
import { fetchAssetInfo } from '@/lib/api/server'
import { buildAssetMetadata } from '@/lib/metadata'
import SwapAssetPage from './page.client'

interface Props {
  params: Promise<{ asset: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { asset } = await params

  const info = await fetchAssetInfo(asset)
  const displayAsset = info?.asset_longname ?? asset

  return buildAssetMetadata(
    asset,
    `${displayAsset} Swaps`,
    `Buy ${displayAsset} via atomic swap on the Counterparty network.`,
  )
}

export default function Page({ params }: Props) {
  return <SwapAssetPage params={params} />
}
