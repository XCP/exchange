import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata(
  'Counterparty Assets',
  'Every tradeable Counterparty asset, ranked by volume across its markets and dispensers.',
  '/explore/assets',
)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
