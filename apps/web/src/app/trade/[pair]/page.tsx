import { permanentRedirect } from 'next/navigation'

/**
 * `/trade/BASE_QUOTE` is retired. It survives only to forward its links.
 *
 * It was the one page that tried to be the whole exchange for a pair — book
 * ladder, chart, form, holders, markets, pool info — and every one of those
 * jobs now has a better home: `/swap/BASE/QUOTE` for acting on the market,
 * `/BASE` for reading the asset, `/pool/LP` for the pool, `/explore/orders`
 * for the book across markets. Keeping it meant maintaining a fifth,
 * half-current copy of all four.
 *
 * This lives as a route rather than a `next.config` rule because the slug
 * cannot be split by a path pattern: a base asset may itself contain
 * underscores, so the boundary is the LAST one, not the first.
 *
 * @see next.config.ts for the exact-path redirects that need no parsing.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ pair: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { pair } = await params
  const sp = await searchParams

  const cut = pair.lastIndexOf('_')
  // No separator means it was never a pair slug. The asset page is the
  // closest true thing, and it 404s honestly if the name is nonsense.
  if (cut < 1) permanentRedirect(`/${encodeURIComponent(pair.toUpperCase())}`)

  const base = pair.slice(0, cut).toUpperCase()
  const quote = pair.slice(cut + 1).toUpperCase()
  const market = `/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`

  // These params came from clicking a specific resting order, which is a
  // request to meet a price — a limit action, not a market one. Sending
  // that to /swap would silently drop the price the click was about.
  const first = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])
  const side = first('side')
  const price = first('price')
  const amount = first('amount')
  if (side || price || amount) {
    const qs = new URLSearchParams()
    if (side) qs.set('side', side)
    if (price) qs.set('price', price)
    if (amount) qs.set('amount', amount)
    permanentRedirect(`/limit${market}?${qs}`)
  }

  permanentRedirect(`/swap${market}`)
}
