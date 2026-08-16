import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'
import LiquidityPage from './page.client'

/**
 * One canonical for all three URLs.
 *
 * /liquidity, /liquidity/deposit and /liquidity/withdrawal are the same form
 * in two states, so there is one page for search engines to count. The titles
 * still differ, because a shared link should say which half it opens on —
 * canonical is the SEO answer, not the sharing one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ params?: string[] }>
}): Promise<Metadata> {
  const segments = (await params).params ?? []
  const verb = segments[0]
  const title =
    verb === 'withdrawal' || verb === 'withdraw' ? 'Withdraw liquidity' : verb === 'deposit' ? 'Add liquidity' : 'Liquidity'
  // The path is always the bare /liquidity, whichever verb is in the URL.
  return buildStaticMetadata(title, undefined, '/liquidity')
}

export default function Page() {
  return <LiquidityPage />
}
