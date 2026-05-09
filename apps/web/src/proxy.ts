import { NextRequest, NextResponse } from 'next/server'

/**
 * Enforce uppercase slugs for /trade/[pair], /dispense/[asset], and /pool/[lp_asset].
 * Redirects /trade/xcp_btc to /trade/XCP_BTC (301 permanent).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only apply to dynamic route segments
  const match = pathname.match(/^\/(trade|dispense|pool)\/(.+)$/)
  if (!match) return NextResponse.next()

  const [, prefix, slug] = match
  const upper = slug.toUpperCase()

  if (slug !== upper) {
    const url = request.nextUrl.clone()
    url.pathname = `/${prefix}/${upper}`
    return NextResponse.redirect(url, 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/trade/:path+', '/dispense/:path+', '/pool/:path+'],
}
