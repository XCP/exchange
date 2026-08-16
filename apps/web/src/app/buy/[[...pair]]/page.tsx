import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { fetchAssetInfo } from '@/lib/api/server'
import { DISPENSE_DEFAULT_ASSET, buildFormMetadata, omitDefault, pairPath, parsePairSegments, resolveAsset } from '@/lib/trade-routes'
import BuyClient from './page.client'

interface Props {
  params: Promise<{ pair?: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { first } = parsePairSegments((await params).pair)
  return buildFormMetadata({
    base: '/buy',
    title: 'Buy',
    first,
  })
}

export default async function Page({ params }: Props) {
  const { first } = parsePairSegments((await params).pair)
  if (!first) return <BuyClient asset={null} />

  const resolved = await resolveAsset(first, fetchAssetInfo)
  if (!resolved) notFound()

  // One URL per page. A subasset arrives under either of its names and only
  // the longname belongs in a link, and /buy/XCP merely spells out the
  // default this route already assumes — both collapse onto the canonical.
  const canonical = pairPath('/buy', omitDefault(resolved.canonical, DISPENSE_DEFAULT_ASSET))
  if (canonical !== pairPath('/buy', first)) permanentRedirect(canonical)

  return <BuyClient asset={resolved} />
}
