import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { fetchAssetInfo } from '@/lib/api/server'
import { buildFormMetadata, pairPath, parsePairSegments, resolveAsset } from '@/lib/trade-routes'
import SwapClient from './page.client'

interface Props {
  params: Promise<{ pair?: string[] }>
}

/**
 * Resolve both legs, or fail loudly.
 *
 * A subasset reaches this page under either of its two names, and only one
 * of them belongs in a URL: `/swap/XCP/A16805049243970262805` redirects to
 * `/swap/XCP/SOUNDGARDEN.Black_Hole_Sun`, as does a wrong-cased longname. An
 * asset that does not exist 404s rather than rendering an empty form.
 */
async function resolvePair(segments: string[] | undefined) {
  const { first, second } = parsePairSegments(segments)
  const requested = [first, second].filter(Boolean) as string[]
  if (requested.length === 0) return { first: null, second: null }

  const [a, b] = await Promise.all([
    resolveAsset(first, fetchAssetInfo),
    resolveAsset(second, fetchAssetInfo),
  ])
  if ((first && !a) || (second && !b)) notFound()

  // One segment is ambiguous — as a give/get path, /swap/PEPECASH could mean
  // either leg. Rather than pick a reading and leave the URL saying something
  // else, redirect to the explicit pair so every /swap link in the wild names
  // both sides. XCP alone means "spend XCP", so it keeps its position.
  const XCP = { name: 'XCP', canonical: 'XCP' }
  const [give, get] = a && !b ? (a.name === 'XCP' ? [a, null] : [XCP, a]) : [a, b]

  const canonicalPath = pairPath('/swap', give?.canonical ?? null, get?.canonical ?? null)
  if (canonicalPath !== pairPath('/swap', first, second)) permanentRedirect(canonicalPath)

  return { first: a, second: b }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { first, second } = parsePairSegments((await params).pair)
  return buildFormMetadata({
    base: '/swap',
    title: 'Swap',
    first,
    second,
  })
}

export default async function Page({ params }: Props) {
  const { first, second } = await resolvePair((await params).pair)
  return <SwapClient first={first} second={second} />
}
