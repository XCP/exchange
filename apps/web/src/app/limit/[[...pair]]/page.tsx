import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { fetchAssetInfo } from '@/lib/api/server'
import { buildFormMetadata, pairPath, parsePairSegments, resolveAsset } from '@/lib/trade-routes'
import LimitClient from './page.client'

interface Props {
  params: Promise<{ pair?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Opening values a link can carry: ?side=buy&price=…&amount=….
 *
 * Read on the server so the form renders filled on first paint rather than
 * snapping into place. `side` is validated against the two it can be; the
 * numbers are handed over as typed and sanitised by the field that owns them.
 */
function readSeed(sp: Record<string, string | string[] | undefined>): {
  side?: 'buy' | 'sell'
  price?: string
  amount?: string
} {
  const one = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  const side = one('side')
  return {
    side: side === 'buy' || side === 'sell' ? side : undefined,
    price: one('price'),
    amount: one('amount'),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { first, second } = parsePairSegments((await params).pair)
  return buildFormMetadata({
    base: '/limit',
    title: 'Limit Order',
    first,
    second,
  })
}

export default async function Page({ params, searchParams }: Props) {
  const { first, second } = parsePairSegments((await params).pair)
  const seed = readSeed(await searchParams)
  if (!first && !second) return <LimitClient base={null} quote={null} seed={seed} />

  // A subasset arrives under either of its names; only the longname belongs
  // in a URL. An asset that doesn't exist 404s rather than rendering an empty
  // form that looks merely broken.
  const [a, b] = await Promise.all([
    resolveAsset(first, fetchAssetInfo),
    resolveAsset(second, fetchAssetInfo),
  ])
  if ((first && !a) || (second && !b)) notFound()

  const canonical = pairPath('/limit', a?.canonical ?? null, b?.canonical ?? null)
  if (canonical !== pairPath('/limit', first, second)) permanentRedirect(canonical)

  return <LimitClient base={a} quote={b} seed={seed} />
}
