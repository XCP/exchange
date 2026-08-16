import { permanentRedirect } from 'next/navigation'

/**
 * /pool/LP_ASSET moved to /LP_ASSET.
 *
 * An LP token is an asset, so its page belongs in the asset namespace with
 * every other one. This route exists only to forward the old URLs.
 *
 * A route rather than a `redirects()` entry in next.config: Next 16's
 * path-to-regexp no longer supports an inline pattern on a param, so
 * `/pool/:lp(A\d+)` silently stopped matching and 404'd instead of erroring.
 */
export default async function Page({ params }: { params: Promise<{ lp_asset: string }> }) {
  const { lp_asset } = await params
  permanentRedirect(`/${lp_asset.toUpperCase()}`)
}
