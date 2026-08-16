import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata(
  'Counterparty Markets',
  'Every Counterparty DEX trading pair, ranked by volume, trades and price change.',
  '/explore/markets',
)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
