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

  // Supply is the only fact this surface has of its own — an atomic-swap
  // listing has no market price, and the asset page next door carries the rest.
  return buildAssetMetadata(asset, `${displayAsset} Swaps`, {
    supply: info?.supply_normalized,
    locked: info?.locked,
  })
}

export default function Page({ params }: Props) {
  return <SwapAssetPage params={params} />
}
