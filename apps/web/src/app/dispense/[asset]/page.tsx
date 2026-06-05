import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { fetchDispenserStats, fetchAssetInfo } from '@/lib/api/server'
import { buildDispenseMetadata } from '@/lib/metadata'
import { XCP_IMG_BASE } from '@/utils/constants'
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

  return {
    ...buildDispenseMetadata(
      asset,
      displayAsset,
      stats?.cheapest_price,
      stats?.last_dispense_price,
      stats?.price_change_24h,
      stats?.active_dispensers,
      info?.description,
    ),
    icons: { icon: `${XCP_IMG_BASE}/icon/BTC` },
  }
}

export default async function Page({ params }: Props) {
  // Canonicalize to uppercase slug (was handled by proxy.ts, unsupported on Cloudflare).
  const { asset } = await params
  const upper = asset.toUpperCase()
  if (asset !== upper) permanentRedirect(`/dispense/${upper}`)
  return <AssetDispensersPage params={params} />
}
