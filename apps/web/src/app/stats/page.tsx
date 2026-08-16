import { Suspense } from 'react'
import type { Metadata } from 'next'
import AnalyticsPage from '@/components/home/analytics-page'

export const metadata: Metadata = {
  title: 'Stats — XCP DEX',
  description:
    'Network activity for the Counterparty DEX: volume, trades, dispenses, top pairs and the most active traders.',
  openGraph: {
    title: 'Stats — XCP DEX',
    description: 'Volume, trades, dispenses and traders on the Bitcoin-native Counterparty DEX.',
  },
}

/**
 * The dashboard that used to be the homepage.
 *
 * Same component, `stats` face: it drops the hero, the launch strip and the
 * two marquees, and keeps the scoped numbers, charts and traders. The four
 * venue feeds stay on `/` — those show what is happening, which is a front-door
 * job; this page summarises it, which is something you come here to ask.
 */
export default function Page() {
  // The timeframe is read from the query string, which needs a boundary to keep
  // the rest of the page statically rendered — same wrapper every Explore page
  // uses for the same reason.
  return (
    <Suspense>
      <AnalyticsPage variant="stats" />
    </Suspense>
  )
}
