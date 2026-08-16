import { Suspense } from 'react'
import type { Metadata } from 'next'
import AnalyticsPage from '@/components/home/analytics-page'

export const metadata: Metadata = {
  title: 'XCP DEX - Trade Crypto Peer-to-Peer',
  description:
    'Real-time trading volume, top pairs, dispensers, and leaderboards for the Counterparty DEX.',
  openGraph: {
    title: 'XCP DEX - Trade Crypto Peer-to-Peer',
    description: 'Live metrics for the Bitcoin-native Counterparty DEX.',
  },
}

export default function Page() {
  // The timeframe is read from the query string, which needs a boundary to
  // keep the rest of the page statically rendered — the same wrapper every
  // Explore page uses for the same reason.
  return (
    <Suspense>
      <AnalyticsPage />
    </Suspense>
  )
}
