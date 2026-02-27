import type { Metadata } from 'next'
import { fetchDispenserStats, fetchAssetInfo } from '@/lib/api/server'
import { buildDispenseMetadata } from '@/lib/metadata'
import AssetDispensersPage from './page.client'

interface Props {
  params: Promise<{ asset: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { asset } = await params

  const [stats, info] = await Promise.all([
    fetchDispenserStats(asset),
    fetchAssetInfo(asset),
  ])

  const displayAsset = info?.asset_longname ?? asset

  return buildDispenseMetadata(
    asset,
    displayAsset,
    stats?.cheapest_price,
    stats?.last_dispense_price,
    stats?.price_change_24h,
    stats?.active_dispensers,
    info?.description,
  )
}

export default function Page({ params }: Props) {
  return <AssetDispensersPage params={params} />
}
