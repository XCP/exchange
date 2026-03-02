import type { Metadata } from 'next'
import AnalyticsPage from '@/components/home/analytics-page'

export const metadata: Metadata = {
  title: 'XCP DEX — Decentralized Exchange Analytics',
  description:
    'Real-time trading volume, top pairs, dispensers, and leaderboards for the Counterparty DEX.',
  openGraph: {
    title: 'XCP DEX Analytics',
    description: 'Live metrics for the Bitcoin-native Counterparty DEX.',
  },
}

export default function Page() {
  return <AnalyticsPage />
}
