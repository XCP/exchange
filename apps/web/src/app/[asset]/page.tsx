import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { assetExists, fetchAssetInfo, fetchDispenserStats, fetchPairStats, fetchPool } from '@/lib/api/server'
import { buildPoolMetadata } from '@/lib/metadata'
import PoolDetailPage from '@/components/pool/pool-detail'
import { buildAssetMetadata } from '@/lib/metadata'
import AssetPage from './page.client'

interface Props {
  params: Promise<{ asset: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { asset } = await params

  // An LP token is an asset like any other, so it shares this namespace — and
  // it wants a completely different card. Checked first because a pool has a
  // pair and reserves to describe, where the generic asset card would report
  // a supply nobody holds on purpose.
  const pool = await fetchPool(asset.toUpperCase())
  if (pool) {
    return buildPoolMetadata(
      asset.toUpperCase(),
      pool.pair,
      pool.asset_a,
      pool.asset_b,
      pool.reserve_a,
      pool.reserve_b,
      pool.match_count,
    )
  }

  // Three cached reads in parallel. Metadata must not become the slowest thing
  // on the page, and every one of these degrades to null rather than throwing.
  const [info, pair, disp] = await Promise.all([
    fetchAssetInfo(asset),
    fetchPairStats(`${asset}_XCP`),
    fetchDispenserStats(asset),
  ])

  // XCP priced in XCP is 1, which is true and useless. Its dollar history
  // lives at /price/XCP; here the dispenser count is the real fact.
  const pricedInXcp = asset.toUpperCase() !== 'XCP'

  return buildAssetMetadata(asset, info?.asset_longname ?? asset, {
    price: pricedInXcp ? pair?.last_price : null,
    change24h: pricedInXcp ? pair?.price_change_24h : null,
    dispensers: disp?.active_dispensers,
    supply: info?.supply_normalized,
    locked: info?.locked,
  })
}

export default async function Page({ params }: Props) {
  const { asset } = await params
  /**
   * A name nobody has ever issued is not a page. It used to render the full
   * asset layout with every panel empty and return 200, which told crawlers
   * that /fdssafdsfsda was a real thing.
   *
   * Only a definite "no" 404s. If Counterparty is unreachable the page still
   * renders — the client fetches its own data anyway, and a transient upstream
   * failure must not cache a 404 over a real asset.
   */
  const upper = asset.toUpperCase()
  // A liquidity-pool token gets the pool view rather than the asset view.
  // Both are pages about an asset; only one of them is useful about this one.
  const pool = await fetchPool(upper)
  if (pool) return <PoolDetailPage lpAsset={upper} />
  if ((await assetExists(asset)) === 'no') notFound()
  return <AssetPage params={params} />
}
